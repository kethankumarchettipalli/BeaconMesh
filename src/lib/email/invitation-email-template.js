/**
 * BeaconMesh Personnel Invitation Email Builder
 *
 * Generates responsive HTML and plain-text transactional email content
 * for Administrator-provisioned personnel invitations.
 */

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function formatAssignedRoleLabel({ targetRole, targetCommandLevel, targetResponderSubtype }) {
    if (targetRole === "COMMAND" || targetCommandLevel === "COORDINATOR") {
        return "Command Operations (Coordinator)";
    }
    if (targetRole === "RESPONDER") {
        return targetResponderSubtype === "PROFESSIONAL"
            ? "Professional Responder"
            : "Volunteer Responder";
    }
    return "Authorized Personnel";
}

export function formatOperationalUnitLabel(unit) {
    if (!unit)
        return null;
    const labels = {
        GENERAL: "General Operations",
        MEDICAL: "Medical",
        SEARCH_AND_RESCUE: "Search & Rescue",
        FIRE_HAZARD: "Fire & Hazard",
        LOGISTICS: "Logistics",
    };
    return labels[String(unit).toUpperCase()] || String(unit);
}

export function buildInvitationEmailContent({
    fullName,
    targetRole,
    targetCommandLevel = null,
    targetResponderSubtype = null,
    targetUnit = null,
    invitedByName = "Command Administrator",
    inviteUrl,
    expiresAtIso,
}) {
    const safeName = escapeHtml(fullName || "Personnel");
    const roleLabel = formatAssignedRoleLabel({ targetRole, targetCommandLevel, targetResponderSubtype });
    const unitLabel = targetRole === "RESPONDER" ? formatOperationalUnitLabel(targetUnit) : null;
    const inviterLabel = escapeHtml(invitedByName || "Command Administrator");
    const safeUrl = escapeHtml(inviteUrl);
    const expiryText = expiresAtIso
        ? new Date(expiresAtIso).toUTCString()
        : "7 days from issuance";

    const subject = `BeaconMesh Invitation: ${roleLabel}`;

    const text = [
        `Hello ${fullName || "Personnel"},`,
        "",
        `You have been invited by ${invitedByName || "a BeaconMesh Command Administrator"} to join BeaconMesh as ${roleLabel}${unitLabel ? ` (Operational Unit: ${unitLabel})` : ""}.`,
        "",
        "Complete your registration using this single-use invitation link:",
        inviteUrl,
        "",
        `Expiration: ${expiryText}`,
        "",
        "Security Notice: This invitation link is single-use, tied to your email address, and must not be shared with anyone else.",
        "",
        "— BeaconMesh Command Administration",
    ].join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f5f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:20px 24px;color:#ffffff;">
              <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">Beacon<span style="color:#f97316;">Mesh</span></div>
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;margin-top:4px;">Personnel Provisioning Invitation</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 14px;font-size:15px;line-height:1.5;">Hello <strong>${safeName}</strong>,</p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
                <strong>${inviterLabel}</strong> has invited you to activate an authorized personnel account on <strong>BeaconMesh</strong>.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;line-height:1.6;">
                    <div><strong>Assigned Role:</strong> ${escapeHtml(roleLabel)}</div>
                    ${unitLabel ? `<div><strong>Operational Unit:</strong> ${escapeHtml(unitLabel)}</div>` : ""}
                    <div><strong>Expires:</strong> ${escapeHtml(expiryText)}</div>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                <tr>
                  <td align="center" style="background-color:#ea580c;border-radius:6px;">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Accept Invitation &amp; Register
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;color:#4b5563;">If the button above does not open, copy and paste this URL into your browser:</p>
              <p style="margin:0 0 18px;font-size:12px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px;color:#111827;">
                ${safeUrl}
              </p>
              <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;line-height:1.5;color:#6b7280;">
                <strong>Security Notice:</strong> This link is single-use, bound to your invited email address, and must not be forwarded or shared.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
}
