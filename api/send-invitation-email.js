import {
    handleSendInvitationEmail,
    buildCanonicalProductionInviteUrl,
} from "../src/lib/email/send-invitation-handler.js";

export { buildCanonicalProductionInviteUrl };

export default async function handler(req, res) {
    const result = await handleSendInvitationEmail({
        method: req.method,
        authorizationHeader: req.headers?.authorization || req.headers?.Authorization || "",
        body: req.body,
    });
    return res.status(result.status).json(result.body);
}
