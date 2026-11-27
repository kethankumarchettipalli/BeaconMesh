import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
    mockAuth: {
        currentUser: {
            uid: "admin-1",
            getIdToken: vi.fn(async () => "mock-admin-id-token"),
        },
    },
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

function createMockRes() {
    const res = {
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
    return res;
}

describe("Personnel Invitation URLs, Email Template & Server Delivery", () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.RESEND_API_KEY = "re_test_mock_key";
        process.env.RESEND_FROM_EMAIL = "BeaconMesh <noreply@beaconmesh.test>";
        process.env.FIREBASE_WEB_API_KEY = "mock-web-api-key";
        process.env.FIREBASE_PROJECT_ID = "beaconmesh-c8347";
        process.env.PUBLIC_APP_URL = "https://beacon-mesh-eta.vercel.app";
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        process.env = { ...originalEnv };
    });

    it("1-3. generates production URL by default, supports local dev origin, and URL-encodes parameters", () => {
        expect(DEFAULT_PRODUCTION_APP_URL).toBe("https://beacon-mesh-eta.vercel.app");
        expect(resolveInvitationBaseUrl()).toBe("https://beacon-mesh-eta.vercel.app");

        const prodUrl = buildInvitationUrl("inv-123", "priya+ops@agency.org");
        expect(prodUrl).toBe(
            "https://beacon-mesh-eta.vercel.app/signup?invite=inv-123&email=priya%2Bops%40agency.org"
        );

        const serverProdUrl = buildCanonicalProductionInviteUrl("inv/abc", "User+Test@example.com");
        expect(serverProdUrl).toBe(
            "https://beacon-mesh-eta.vercel.app/signup?invite=inv%2Fabc&email=user%2Btest%40example.com"
        );

        // Local development URL support when explicitly running in dev on localhost
        vi.stubGlobal("window", { location: { origin: "http://localhost:8080", hostname: "localhost" } });
        expect(resolveInvitationBaseUrl({ preferLocalOrigin: true })).toBe("http://localhost:8080");
        // Default without preferLocalOrigin still uses production URL so email links never leak localhost
        expect(resolveInvitationBaseUrl()).toBe("https://beacon-mesh-eta.vercel.app");
        vi.unstubAllGlobals();
    });

    it("10. builds responsive HTML and plain-text email with role, unit, expiry, and security notice", () => {
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

    it("4 & 8. sends email via Resend on valid Administrator request and prevents rapid duplicate sends", async () => {
        globalThis.fetch = vi.fn(async (url) => {
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
            if (u.includes("/invitations/inv-ok-1")) {
                return new Response(
                    JSON.stringify({
                        fields: {
                            id: { stringValue: "inv-ok-1" },
                            email: { stringValue: "ops@agency.org" },
                            fullName: { stringValue: "Ops User" },
                            targetRole: { stringValue: "COMMAND" },
                            targetCommandLevel: { stringValue: "COORDINATOR" },
                            invitedByName: { stringValue: "Admin" },
                            status: { stringValue: "PENDING" },
                            expiresAt: { timestampValue: new Date(Date.now() + 86400_000).toISOString() },
                        },
                    }),
                    { status: 200 }
                );
            }
            if (u === "https://api.resend.com/emails") {
                return new Response(JSON.stringify({ id: "re_msg_123" }), { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });

        const res1 = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer valid-tok" }, body: { invitationId: "inv-ok-1" } },
            res1
        );
        expect(res1.statusCode).toBe(200);
        expect(res1.body).toMatchObject({ accepted: true, provider: "resend", messageId: "re_msg_123" });

        // Rapid duplicate without isRetry is blocked (429)
        const resDup = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer valid-tok" }, body: { invitationId: "inv-ok-1" } },
            resDup
        );
        expect(resDup.statusCode).toBe(429);

        // Retry with isRetry: true is permitted
        const resRetry = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer valid-tok" }, body: { invitationId: "inv-ok-1", isRetry: true } },
            resRetry
        );
        expect(resRetry.statusCode).toBe(200);
    });

    it("5 & 6. handles Resend provider failure gracefully and allows client retry", async () => {
        let shouldFail = true;
        globalThis.fetch = vi.fn(async () => {
            if (shouldFail) {
                return new Response(JSON.stringify({ error: "Resend domain not verified" }), { status: 502 });
            }
            return new Response(JSON.stringify({ accepted: true, provider: "resend", messageId: "re_retry_1" }), { status: 200 });
        });

        const failed = await sendPersonnelInvitationEmail({ invitationId: "inv-retry-1" });
        expect(failed.ok).toBe(false);
        expect(failed.status).toBe("FAILED");
        expect(failed.error).toContain("Resend domain not verified");

        shouldFail = false;
        const retried = await sendPersonnelInvitationEmail({ invitationId: "inv-retry-1", isRetry: true });
        expect(retried.ok).toBe(true);
        expect(retried.status).toBe("SENT");
        expect(retried.messageId).toBe("re_retry_1");
    });

    it("7 & 9. rejects unauthorized callers and expired invitations", async () => {
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

        // Expired invitation -> 410
        globalThis.fetch = vi.fn(async (url) => {
            const u = String(url);
            if (u.includes("accounts:lookup")) {
                return new Response(JSON.stringify({ users: [{ localId: "admin-2", emailVerified: true }] }), { status: 200 });
            }
            if (u.includes("/users/admin-2")) {
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
            if (u.includes("/invitations/inv-exp-1")) {
                return new Response(
                    JSON.stringify({
                        fields: {
                            id: { stringValue: "inv-exp-1" },
                            email: { stringValue: "exp@agency.org" },
                            status: { stringValue: "PENDING" },
                            expiresAt: { timestampValue: new Date(Date.now() - 60_000).toISOString() },
                        },
                    }),
                    { status: 200 }
                );
            }
            return new Response("Not found", { status: 404 });
        });

        const resExp = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer admin2-tok" }, body: { invitationId: "inv-exp-1" } },
            resExp
        );
        expect(resExp.statusCode).toBe(410);

        // Revoked or CLAIMED invitation -> 409
        globalThis.fetch = vi.fn(async (url) => {
            const u = String(url);
            if (u.includes("accounts:lookup")) {
                return new Response(JSON.stringify({ users: [{ localId: "admin-2", emailVerified: true }] }), { status: 200 });
            }
            if (u.includes("/users/admin-2")) {
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
            if (u.includes("/invitations/inv-rev-1")) {
                return new Response(
                    JSON.stringify({
                        fields: {
                            id: { stringValue: "inv-rev-1" },
                            email: { stringValue: "rev@agency.org" },
                            status: { stringValue: "REVOKED" },
                        },
                    }),
                    { status: 200 }
                );
            }
            return new Response("Not found", { status: 404 });
        });

        const resRev = createMockRes();
        await handler(
            { method: "POST", headers: { authorization: "Bearer admin2-tok" }, body: { invitationId: "inv-rev-1" } },
            resRev
        );
        expect(resRev.statusCode).toBe(409);
    });

    it("6. ignores client-supplied recipient/role overrides and uses Firestore invitation record", async () => {
        let resendPayload = null;
        globalThis.fetch = vi.fn(async (url, init) => {
            const u = String(url);
            if (u.includes("accounts:lookup")) {
                return new Response(JSON.stringify({ users: [{ localId: "admin-3", emailVerified: true }] }), { status: 200 });
            }
            if (u.includes("/users/admin-3")) {
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
            if (u.includes("/invitations/inv-lock-1")) {
                return new Response(
                    JSON.stringify({
                        fields: {
                            id: { stringValue: "inv-lock-1" },
                            email: { stringValue: "trusted@agency.org" },
                            fullName: { stringValue: "Trusted User" },
                            targetRole: { stringValue: "RESPONDER" },
                            targetResponderSubtype: { stringValue: "VOLUNTEER" },
                            targetUnit: { stringValue: "LOGISTICS" },
                            invitedByName: { stringValue: "Admin" },
                            status: { stringValue: "PENDING" },
                            expiresAt: { timestampValue: new Date(Date.now() + 86400_000).toISOString() },
                        },
                    }),
                    { status: 200 }
                );
            }
            if (u === "https://api.resend.com/emails") {
                resendPayload = JSON.parse(init.body);
                return new Response(JSON.stringify({ id: "re_lock_1" }), { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });

        const res = createMockRes();
        await handler(
            {
                method: "POST",
                headers: { authorization: "Bearer admin3-tok" },
                body: {
                    invitationId: "inv-lock-1",
                    email: "attacker@evil.com",
                    targetRole: "COMMAND",
                    inviteUrl: "https://evil.com/phish",
                },
            },
            res
        );
        expect(res.statusCode).toBe(200);
        expect(resendPayload.to).toEqual(["trusted@agency.org"]);
        expect(resendPayload.subject).toContain("Volunteer Responder");
        expect(resendPayload.text).toContain("https://beacon-mesh-eta.vercel.app/signup?invite=inv-lock-1&email=trusted%40agency.org");
        expect(resendPayload.text).not.toContain("evil.com");
    });
});
