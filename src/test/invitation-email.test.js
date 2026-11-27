import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuth, mockSendMail, mockCreateTransport } = vi.hoisted(() => {
    const sendMail = vi.fn();
    const createTransport = vi.fn(() => ({ sendMail }));
    return {
        mockSendMail: sendMail,
        mockCreateTransport: createTransport,
        mockAuth: {
            currentUser: {
                uid: "admin-1",
                getIdToken: vi.fn(async () => "mock-admin-id-token"),
            },
        },
    };
});

vi.mock("nodemailer", () => ({
    default: { createTransport: mockCreateTransport },
    createTransport: mockCreateTransport,
}));

vi.mock("@/lib/firebase", () => ({
    db: {},
    auth: mockAuth,
    isFirebaseConfigured: true,
}));

import {
    DEFAULT_PRODUCTION_APP_URL,
    resolveInvitationBaseUrl,
    buildInvitationUrl,
    sendPersonnelInvitationEmail,
} from "@/lib/services/command-service";
import { buildInvitationEmailContent } from "@/lib/email/invitation-email-template";
import handler, { buildCanonicalProductionInviteUrl } from "../../api/send-invitation-email.js";
import { getSmtpConfigFromEnv } from "@/lib/email/send-invitation-handler";

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function mockAdminAndPendingInviteFetch(invOverrides = {}) {
    return vi.fn(async (url) => {
        const u = String(url);
        if (u.includes("accounts:lookup")) {
            return new Response(JSON.stringify({ users: [{ localId: "admin-1", emailVerified: true }] }), { status: 200 });
        }
        if (u.includes("/users/admin-1")) {
            return new Response(
                JSON.stringify({
                    fields: {
                        role: { stringValue: "COMMAND" },
                        commandLevel: { stringValue: "ADMINISTRATOR" },
                        accountStatus: { stringValue: "ACTIVE" },
                    },
                }),
                { status: 200 }
            );
        }
        if (u.includes("/invitations/")) {
            return new Response(
                JSON.stringify({
                    fields: {
                        id: { stringValue: invOverrides.id || "inv-smtp-1" },
                        email: { stringValue: invOverrides.email || "ops@agency.org" },
                        fullName: { stringValue: invOverrides.fullName || "Ops User" },
                        targetRole: { stringValue: invOverrides.targetRole || "COMMAND" },
                        targetCommandLevel: { stringValue: invOverrides.targetCommandLevel || "COORDINATOR" },
                        targetResponderSubtype: invOverrides.targetResponderSubtype
                            ? { stringValue: invOverrides.targetResponderSubtype }
                            : { nullValue: null },
                        targetUnit: invOverrides.targetUnit
                            ? { stringValue: invOverrides.targetUnit }
                            : { nullValue: null },
                        invitedByName: { stringValue: "Kethan Admin" },
                        status: { stringValue: invOverrides.status || "PENDING" },
                        expiresAt: {
                            timestampValue:
                                invOverrides.expiresAt || new Date(Date.now() + 86400_000).toISOString(),
                        },
                    },
                }),
                { status: 200 }
            );
        }
        return new Response("Not found", { status: 404 });
    });
}

describe("Personnel Invitation Gmail SMTP Delivery, URLs & Security", () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.SMTP_HOST = "smtp.gmail.com";
        process.env.SMTP_PORT = "465";
        process.env.SMTP_SECURE = "true";
        process.env.SMTP_EMAIL = "beaconmesh.noreply@gmail.com";
        process.env.SMTP_APP_PASSWORD = "abcd efgh ijkl mnop";
        process.env.SMTP_FROM_NAME = "BeaconMesh";
        process.env.FIREBASE_WEB_API_KEY = "mock-web-api-key";
        process.env.FIREBASE_PROJECT_ID = "beaconmesh-c8347";
        process.env.PUBLIC_APP_URL = "https://beacon-mesh-eta.vercel.app";
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        process.env = { ...originalEnv };
    });

    it("normalizes Google App Password whitespace and builds canonical production URLs", () => {
        const cfg = getSmtpConfigFromEnv();
        expect(cfg.host).toBe("smtp.gmail.com");
        expect(cfg.port).toBe(465);
        expect(cfg.secure).toBe(true);
        expect(cfg.email).toBe("beaconmesh.noreply@gmail.com");
        expect(cfg.appPassword).toBe("abcdefghijklmnop");
        expect(cfg.fromName).toBe("BeaconMesh");

        expect(DEFAULT_PRODUCTION_APP_URL).toBe("https://beacon-mesh-eta.vercel.app");
        expect(resolveInvitationBaseUrl()).toBe("https://beacon-mesh-eta.vercel.app");
        expect(buildInvitationUrl("inv-123", "priya+ops@agency.org")).toBe(
            "https://beacon-mesh-eta.vercel.app/signup?invite=inv-123&email=priya%2Bops%40agency.org"
        );
        expect(buildCanonicalProductionInviteUrl("inv/abc", "User+Test@example.com")).toBe(
            "https://beacon-mesh-eta.vercel.app/signup?invite=inv%2Fabc&email=user%2Btest%40example.com"
        );
    });

    it("builds responsive HTML and plain-text email with role, unit, expiry, and security notice", () => {
        const { subject, html, text } = buildInvitationEmailContent({
            fullName: "Priya <Sharma>",
            targetRole: "RESPONDER",
            targetResponderSubtype: "PROFESSIONAL",
            targetUnit: "MEDICAL",
            invitedByName: "Kethan Admin",
            inviteUrl: "https://beacon-mesh-eta.vercel.app/signup?invite=inv-1&email=priya%40agency.org",
            expiresAtIso: "2026-12-04T10:00:00.000Z",
        });

        expect(subject).toContain("Professional Responder");
        expect(html).toContain("Beacon<span style=\"color:#f97316;\">Mesh</span>");
        expect(html).toContain("Priya &lt;Sharma&gt;");
        expect(html).toContain("Medical");
        expect(html).toContain("single-use");
        expect(text).toContain("https://beacon-mesh-eta.vercel.app/signup?invite=inv-1&email=priya%40agency.org");
    });

    it("1, 9, 11, 13. sends via Gmail SMTP with normalized credentials, enforces cooldown, and supports retry", async () => {
        globalThis.fetch = mockAdminAndPendingInviteFetch({ id: "inv-smtp-1" });
        mockSendMail.mockResolvedValue({
            messageId: "<msg-001@smtp.gmail.com>",
            accepted: ["ops@agency.org"],
        });

        const res1 = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer valid-tok" }, body: { invitationId: "inv-smtp-1" } },
            res1
        );

        expect(res1.statusCode).toBe(200);
        expect(res1.body).toMatchObject({
            accepted: true,
            provider: "gmail-smtp",
            messageId: "<msg-001@smtp.gmail.com>",
        });
        expect(mockCreateTransport).toHaveBeenCalledWith(
            expect.objectContaining({
                host: "smtp.gmail.com",
                port: 465,
                secure: true,
                auth: { user: "beaconmesh.noreply@gmail.com", pass: "abcdefghijklmnop" },
            })
        );
        expect(mockSendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                from: '"BeaconMesh" <beaconmesh.noreply@gmail.com>',
                to: "ops@agency.org",
            })
        );

        // Rapid duplicate without isRetry is blocked (429)
        const resDup = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer valid-tok" }, body: { invitationId: "inv-smtp-1" } },
            resDup
        );
        expect(resDup.statusCode).toBe(429);

        // Retry with isRetry: true succeeds
        const resRetry = createMockRes();
        await handler(
            {
                method: "POST",
                headers: { authorization: "Bearer valid-tok" },
                body: { invitationId: "inv-smtp-1", isRetry: true },
            },
            resRetry
        );
        expect(resRetry.statusCode).toBe(200);
    });

    it("2, 3, 14. handles SMTP authentication failure (EAUTH) and connection timeout (ETIMEDOUT)", async () => {
        globalThis.fetch = mockAdminAndPendingInviteFetch({ id: "inv-auth-fail" });
        mockSendMail.mockRejectedValueOnce(Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 }));

        const resAuthFail = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer valid-tok" }, body: { invitationId: "inv-auth-fail" } },
            resAuthFail
        );
        expect(resAuthFail.statusCode).toBe(502);
        expect(resAuthFail.body.error).toContain("SMTP authentication failed");

        globalThis.fetch = mockAdminAndPendingInviteFetch({ id: "inv-timeout" });
        mockSendMail.mockRejectedValueOnce(Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" }));

        const resTimeout = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer valid-tok" }, body: { invitationId: "inv-timeout" } },
            resTimeout
        );
        expect(resTimeout.statusCode).toBe(504);
        expect(resTimeout.body.error).toContain("timed out");

        // Client helper returns structured failure without throwing
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "SMTP authentication failed." }), { status: 502 }));
        const clientFail = await sendPersonnelInvitationEmail({ invitationId: "inv-auth-fail" });
        expect(clientFail.ok).toBe(false);
        expect(clientFail.status).toBe("FAILED");
    });

    it("4, 5, 6, 7, 8. rejects unauthorized callers, non-admins, expired/revoked invites, and recipient overrides", async () => {
        const resUnauth = createMockRes();
        await handler({ method: "POST", headers: {}, body: { invitationId: "inv-1" } }, resUnauth);
        expect(resUnauth.statusCode).toBe(401);

        globalThis.fetch = vi.fn(async (url) => {
            const u = String(url);
            if (u.includes("accounts:lookup")) {
                return new Response(JSON.stringify({ users: [{ localId: "coord-1", emailVerified: true }] }), { status: 200 });
            }
            if (u.includes("/users/coord-1")) {
                return new Response(
                    JSON.stringify({
                        fields: {
                            role: { stringValue: "COMMAND" },
                            commandLevel: { stringValue: "COORDINATOR" },
                            accountStatus: { stringValue: "ACTIVE" },
                        },
                    }),
                    { status: 200 }
                );
            }
            return new Response("Not found", { status: 404 });
        });
        const resCoord = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer coord-tok" }, body: { invitationId: "inv-1" } },
            resCoord
        );
        expect(resCoord.statusCode).toBe(403);

        globalThis.fetch = mockAdminAndPendingInviteFetch({
            id: "inv-exp-1",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
        });
        const resExp = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer admin-tok" }, body: { invitationId: "inv-exp-1" } },
            resExp
        );
        expect(resExp.statusCode).toBe(410);

        globalThis.fetch = mockAdminAndPendingInviteFetch({ id: "inv-rev-1", status: "REVOKED" });
        const resRev = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer admin-tok" }, body: { invitationId: "inv-rev-1" } },
            resRev
        );
        expect(resRev.statusCode).toBe(409);

        globalThis.fetch = mockAdminAndPendingInviteFetch({
            id: "inv-lock-1",
            email: "trusted@agency.org",
            targetRole: "RESPONDER",
            targetResponderSubtype: "VOLUNTEER",
            targetUnit: "LOGISTICS",
        });
        mockSendMail.mockResolvedValueOnce({ messageId: "<lock@smtp.gmail.com>", accepted: ["trusted@agency.org"] });

        const resLock = createMockRes();
        await handler(
            {
                method: "POST",
                headers: { authorization: "Bearer admin-tok" },
                body: {
                    invitationId: "inv-lock-1",
                    email: "attacker@evil.com",
                    targetRole: "COMMAND",
                    inviteUrl: "https://evil.com/phish",
                },
            },
            resLock
        );
        expect(resLock.statusCode).toBe(200);
        expect(mockSendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "trusted@agency.org",
            })
        );
        const sentArgs = mockSendMail.mock.calls[0][0];
        expect(sentArgs.text).toContain("https://beacon-mesh-eta.vercel.app/signup?invite=inv-lock-1&email=trusted%40agency.org");
        expect(sentArgs.text).not.toContain("evil.com");
    });
});
