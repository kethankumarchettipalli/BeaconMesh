import nodemailer from "nodemailer";
import { buildInvitationEmailContent } from "./invitation-email-template.js";

const DEFAULT_PRODUCTION_APP_URL = "https://beacon-mesh-eta.vercel.app";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const DUPLICATE_COOLDOWN_MS = 10_000;

const adminRateMap = new Map();
const recentInviteSendMap = new Map();

function readServerEnv(key) {
    if (typeof process !== "undefined" && process.env && typeof process.env[key] === "string") {
        return process.env[key].trim();
    }
    return "";
}

function checkRateLimit(adminUid, invitationId, allowResend = false) {
    const now = Date.now();
    const timestamps = (adminRateMap.get(adminUid) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
        return {
            allowed: false,
            status: 429,
            error: "Too many invitation email requests. Please wait a minute and retry.",
        };
    }
    const lastSent = recentInviteSendMap.get(invitationId);
    if (!allowResend && lastSent && now - lastSent < DUPLICATE_COOLDOWN_MS) {
        return {
            allowed: false,
            status: 429,
            error: "Invitation email was just requested. Please wait a few seconds before retrying.",
        };
    }
    timestamps.push(now);
    adminRateMap.set(adminUid, timestamps);
    recentInviteSendMap.set(invitationId, now);
    return { allowed: true };
}

function getFirestoreField(fields, key) {
    const val = fields?.[key];
    if (!val)
        return null;
    if ("stringValue" in val)
        return val.stringValue;
    if ("booleanValue" in val)
        return val.booleanValue;
    if ("timestampValue" in val)
        return val.timestampValue;
    if ("nullValue" in val)
        return null;
    return null;
}

async function verifyFirebaseAdministrator(idToken, apiKey, projectId) {
    if (!apiKey || !projectId) {
        throw new Error("Server Firebase configuration is incomplete.");
    }
    const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        }
    );
    if (!lookupRes.ok) {
        return { authorized: false, status: 401, error: "Invalid or expired authentication token." };
    }
    const lookupData = await lookupRes.json();
    const authUser = lookupData?.users?.[0];
    if (!authUser?.localId || !authUser.emailVerified) {
        return { authorized: false, status: 403, error: "Verified administrator authentication is required." };
    }

    const uid = authUser.localId;
    const userDocRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
        {
            headers: { Authorization: `Bearer ${idToken}` },
        }
    );
    if (!userDocRes.ok) {
        return { authorized: false, status: 403, error: "Unable to verify administrator profile." };
    }
    const userDoc = await userDocRes.json();
    const fields = userDoc?.fields || {};
    const role = getFirestoreField(fields, "role");
    const commandLevel = getFirestoreField(fields, "commandLevel");
    const accountStatus = getFirestoreField(fields, "accountStatus");

    if (role !== "COMMAND" || commandLevel !== "ADMINISTRATOR" || accountStatus !== "ACTIVE") {
        return {
            authorized: false,
            status: 403,
            error: "Forbidden: Only active Command Administrators may send invitation emails.",
        };
    }
    return { authorized: true, uid };
}

async function verifyPendingInvitation(invitationId, idToken, projectId) {
    const invRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/invitations/${encodeURIComponent(invitationId)}`,
        {
            headers: { Authorization: `Bearer ${idToken}` },
        }
    );
    if (!invRes.ok) {
        return { valid: false, status: 404, error: "Invitation record not found." };
    }
    const invDoc = await invRes.json();
    const fields = invDoc?.fields || {};
    const status = getFirestoreField(fields, "status");
    const expiresAt = getFirestoreField(fields, "expiresAt");
    if (status !== "PENDING") {
        return { valid: false, status: 409, error: `Invitation is ${status || "not pending"} and cannot be emailed.` };
    }
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return { valid: false, status: 410, error: "Invitation has expired." };
    }
    return {
        valid: true,
        invitation: {
            id: getFirestoreField(fields, "id") || invitationId,
            email: getFirestoreField(fields, "email"),
            fullName: getFirestoreField(fields, "fullName"),
            targetRole: getFirestoreField(fields, "targetRole"),
            targetCommandLevel: getFirestoreField(fields, "targetCommandLevel"),
            targetResponderSubtype: getFirestoreField(fields, "targetResponderSubtype"),
            targetUnit: getFirestoreField(fields, "targetUnit"),
            invitedByName: getFirestoreField(fields, "invitedByName"),
            expiresAtIso: expiresAt,
        },
    };
}

export function buildCanonicalProductionInviteUrl(invitationId, email) {
    const rawBase =
        readServerEnv("PUBLIC_APP_URL") ||
        readServerEnv("VITE_PUBLIC_APP_URL") ||
        DEFAULT_PRODUCTION_APP_URL;
    let baseUrl = DEFAULT_PRODUCTION_APP_URL;
    try {
        const parsed = new URL(rawBase);
        if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
            baseUrl = parsed.origin;
        }
    }
    catch {
        baseUrl = DEFAULT_PRODUCTION_APP_URL;
    }
    return `${baseUrl}/signup?invite=${encodeURIComponent(invitationId)}&email=${encodeURIComponent(String(email || "").trim().toLowerCase())}`;
}

export function getSmtpConfigFromEnv() {
    const host = readServerEnv("SMTP_HOST") || "smtp.gmail.com";
    const port = Number(readServerEnv("SMTP_PORT") || "465") || 465;
    const secureRaw = readServerEnv("SMTP_SECURE");
    const secure = secureRaw ? secureRaw.toLowerCase() === "true" : port === 465;
    const email = readServerEnv("SMTP_EMAIL");
    const appPassword = readServerEnv("SMTP_APP_PASSWORD").replace(/\s+/g, "");
    const fromName = readServerEnv("SMTP_FROM_NAME") || "BeaconMesh";
    return { host, port, secure, email, appPassword, fromName };
}

export async function handleSendInvitationEmail({ method, authorizationHeader, body }) {
    if (method !== "POST") {
        return { status: 405, body: { error: "Method not allowed." } };
    }

    const authHeader = String(authorizationHeader || "");
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!idToken) {
        return { status: 401, body: { error: "Missing Bearer authorization token." } };
    }

    const smtp = getSmtpConfigFromEnv();
    if (!smtp.email || !smtp.appPassword) {
        return {
            status: 503,
            body: { error: "SMTP email service is not configured on the server (missing SMTP_EMAIL or SMTP_APP_PASSWORD)." },
        };
    }

    const firebaseApiKey = readServerEnv("FIREBASE_WEB_API_KEY") || readServerEnv("VITE_FIREBASE_API_KEY");
    const firebaseProjectId = readServerEnv("FIREBASE_PROJECT_ID") || readServerEnv("VITE_FIREBASE_PROJECT_ID");

    try {
        const authCheck = await verifyFirebaseAdministrator(idToken, firebaseApiKey, firebaseProjectId);
        if (!authCheck.authorized) {
            return { status: authCheck.status, body: { error: authCheck.error } };
        }

        const parsedBody = typeof body === "string" ? JSON.parse(body || "{}") : (body || {});
        const invitationId = String(parsedBody.invitationId || "").trim();
        const allowResend = Boolean(parsedBody.isRetry || parsedBody.isResend);
        if (!invitationId) {
            return { status: 400, body: { error: "invitationId is required." } };
        }

        const rateCheck = checkRateLimit(authCheck.uid, invitationId, allowResend);
        if (!rateCheck.allowed) {
            return { status: rateCheck.status, body: { error: rateCheck.error } };
        }

        const invCheck = await verifyPendingInvitation(invitationId, idToken, firebaseProjectId);
        if (!invCheck.valid) {
            return { status: invCheck.status, body: { error: invCheck.error } };
        }

        const inv = invCheck.invitation;
        const inviteUrl = buildCanonicalProductionInviteUrl(inv.id, inv.email);
        const { subject, html, text } = buildInvitationEmailContent({
            fullName: inv.fullName,
            targetRole: inv.targetRole,
            targetCommandLevel: inv.targetCommandLevel,
            targetResponderSubtype: inv.targetResponderSubtype,
            targetUnit: inv.targetUnit,
            invitedByName: inv.invitedByName,
            inviteUrl,
            expiresAtIso: inv.expiresAtIso,
        });

        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: {
                user: smtp.email,
                pass: smtp.appPassword,
            },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 15_000,
        });

        const safeFromName = smtp.fromName.replace(/"/g, "");
        const idempotencyKey = allowResend
            ? `invite-${inv.id}-${Math.floor(Date.now() / 5000)}`
            : `invite-${inv.id}-initial`;

        try {
            const info = await transporter.sendMail({
                from: `"${safeFromName}" <${smtp.email}>`,
                to: inv.email,
                subject,
                html,
                text,
                headers: {
                    "X-BeaconMesh-Invitation-Id": inv.id,
                    "X-Idempotency-Key": idempotencyKey,
                },
            });

            return {
                status: 200,
                body: {
                    accepted: true,
                    provider: "gmail-smtp",
                    messageId: info?.messageId || null,
                    acceptedRecipients: Array.isArray(info?.accepted) ? info.accepted : [inv.email],
                    inviteUrl,
                },
            };
        }
        catch (smtpErr) {
            const code = smtpErr?.code || "";
            const responseCode = smtpErr?.responseCode;
            if (code === "EAUTH" || responseCode === 535 || responseCode === 534) {
                return {
                    status: 502,
                    body: { error: "SMTP authentication failed. Verify Gmail SMTP credentials." },
                };
            }
            if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION") {
                return {
                    status: 504,
                    body: { error: "SMTP connection timed out. Please retry sending the email." },
                };
            }
            return {
                status: 502,
                body: { error: smtpErr?.message || "SMTP server rejected the invitation email." },
            };
        }
    }
    catch (err) {
        console.error("[send-invitation-email] Unexpected error:", err?.message || "unknown");
        return {
            status: 500,
            body: { error: "Failed to process invitation email request." },
        };
    }
}
