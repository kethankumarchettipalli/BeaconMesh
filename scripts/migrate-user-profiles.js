/**
 * BeaconMesh v2.1 User Profile Migration Engine
 *
 * Mandatory Safeguards Enforced:
 * 1. SAFEGUARD 1: Zero Citizen incidents or bookmarks must NEVER be treated as proof of Responder-only registration.
 *    Only trustworthy explicit registration evidence may establish registration history.
 *    Otherwise classify the profile as AMBIGUOUS_MANUAL_REVIEW_REQUIRED and quarantine to capabilities: [].
 * 2. DRY-RUN ONLY: Does not mutate live records unless --commit flag is explicitly passed.
 */

import { normalizeUserProfile } from "../src/lib/user-normalization.js";

export function processProfileForMigration(
  raw,
  isDryRun = true,
) {
  const projected = normalizeUserProfile(raw);
  const uid = raw.uid || "unknown";
  const email = raw.email || "no-email";

  if (raw.accountStatus === "SUSPENDED") {
    return {
      uid,
      email,
      classification: "SUSPENDED",
      actionTaken: isDryRun ? "PROJECTED_UPDATE" : "PROJECTED_UPDATE",
      original: raw,
      projected,
      reason: "Account suspended by administration. Retaining suspended standing.",
    };
  }

  if (raw.role === "COMMAND") {
    return {
      uid,
      email,
      classification: "COMMAND_STAFF",
      actionTaken: isDryRun ? "NO_OP" : "NO_OP",
      original: raw,
      projected,
      reason: "Command staff account. Role and commandLevel preserved.",
    };
  }

  if (raw.role === "RESPONDER" && raw.approvalStatus === "APPROVED") {
    return {
      uid,
      email,
      classification: "EXPLICIT_APPROVED_RESPONDER",
      actionTaken: isDryRun ? "PROJECTED_UPDATE" : "PROJECTED_UPDATE",
      original: raw,
      projected,
      reason: "Approved responder: granted dual capabilities ['CITIZEN', 'RESPONDER'].",
    };
  }

  // Check for ambiguous legacy profiles (role: CITIZEN, requestedRole: RESPONDER, approvalStatus: PENDING, no registrationPath)
  if (
    raw.role === "CITIZEN" &&
    raw.requestedRole === "RESPONDER" &&
    raw.approvalStatus === "PENDING" &&
    !raw.registrationPath
  ) {
    return {
      uid,
      email,
      classification: "AMBIGUOUS_MANUAL_REVIEW_REQUIRED",
      actionTaken: "QUARANTINED_PENDING_MANUAL_REVIEW",
      original: raw,
      projected,
      reason:
        "SAFEGUARD 1 ENFORCED: Profile has role CITIZEN and requestedRole RESPONDER without explicit registrationPath. Zero incidents or bookmarks cannot prove responder-only origin. Quarantined to capabilities: [] until coordinator verification.",
    };
  }

  if (raw.registrationPath === "RESPONDER" && raw.approvalStatus === "PENDING") {
    return {
      uid,
      email,
      classification: "EXPLICIT_PENDING_RESPONDER",
      actionTaken: isDryRun ? "PROJECTED_UPDATE" : "PROJECTED_UPDATE",
      original: raw,
      projected,
      reason: "Explicit responder registration track. Capabilities set to [] until approved.",
    };
  }

  return {
    uid,
    email,
    classification: "EXPLICIT_CITIZEN",
    actionTaken: isDryRun ? "PROJECTED_UPDATE" : "PROJECTED_UPDATE",
    original: raw,
    projected,
    reason: "Standard citizen account: capabilities set to ['CITIZEN'].",
  };
}

export function runMigrationDryRun(
  profiles,
) {
  const auditLog = [];
  const counts = {
    explicitCitizen: 0,
    explicitApprovedResponder: 0,
    explicitPendingResponder: 0,
    commandStaff: 0,
    suspended: 0,
    ambiguousManualReviewRequired: 0,
  };

  for (const p of profiles) {
    const record = processProfileForMigration(p, true);
    auditLog.push(record);

    switch (record.classification) {
      case "EXPLICIT_CITIZEN":
        counts.explicitCitizen++;
        break;
      case "EXPLICIT_APPROVED_RESPONDER":
        counts.explicitApprovedResponder++;
        break;
      case "EXPLICIT_PENDING_RESPONDER":
        counts.explicitPendingResponder++;
        break;
      case "COMMAND_STAFF":
        counts.commandStaff++;
        break;
      case "SUSPENDED":
        counts.suspended++;
        break;
      case "AMBIGUOUS_MANUAL_REVIEW_REQUIRED":
        counts.ambiguousManualReviewRequired++;
        break;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    mode: "DRY_RUN",
    totalScanned: profiles.length,
    counts,
    auditLog,
  };
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "masked-user";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 5))}${local.slice(-1)}@${domain}`;
}

// Standalone execution runner for dry-run inspection
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("migrate-user-profiles")) {
  const isDryRun = !process.argv.includes("--commit");
  console.log(`\n======================================================`);
  console.log(`   BEACONMESH v2.1 PROFILE MIGRATION AUDIT ENGINE`);
  console.log(`   MODE: ${isDryRun ? "DRY-RUN (ZERO WRITES)" : "COMMITTED"}`);
  console.log(`======================================================\n`);

  // Representative profiles from audit suite including observed failure profile
  const sampleProfiles = [
    {
      uid: "observed-failure-uid-01",
      email: "field.volunteer@beaconmesh.org",
      displayName: "Volunteer Candidate",
      role: "CITIZEN",
      requestedRole: "RESPONDER",
      requestedResponderSubtype: "VOLUNTEER",
      approvalStatus: "PENDING",
      emailVerified: true,
      accountStatus: "ACTIVE",
    },
    {
      uid: "approved-medic-02",
      email: "medic.ravi@beaconmesh.org",
      displayName: "Ravi Kumar (EMT)",
      role: "RESPONDER",
      responderSubtype: "PROFESSIONAL",
      approvalStatus: "APPROVED",
      emailVerified: true,
      accountStatus: "ACTIVE",
    },
    {
      uid: "standard-citizen-03",
      email: "citizen.ananya@gmail.com",
      displayName: "Ananya Sharma",
      role: "CITIZEN",
      registrationPath: "CITIZEN",
      approvalStatus: "NOT_REQUIRED",
      emailVerified: true,
      accountStatus: "ACTIVE",
    },
    {
      uid: "command-coord-04",
      email: "coordinator.dispatch@vmc.gov.in",
      displayName: "VMC Control Officer",
      role: "COMMAND",
      commandLevel: "COORDINATOR",
      approvalStatus: "APPROVED",
      emailVerified: true,
      accountStatus: "ACTIVE",
    },
    {
      uid: "suspended-user-05",
      email: "abusive.report@spam.net",
      displayName: "Flagged Account",
      role: "CITIZEN",
      accountStatus: "SUSPENDED",
      approvalStatus: "NOT_REQUIRED",
      emailVerified: false,
    },
    {
      uid: "ambiguous-legacy-06",
      email: "legacy.applicant@yahoo.co.in",
      displayName: "Legacy Applicant",
      role: "CITIZEN",
      requestedRole: "RESPONDER",
      approvalStatus: "PENDING",
      emailVerified: false,
      accountStatus: "ACTIVE",
    },
  ];

  const report = runMigrationDryRun(sampleProfiles);

  console.log(`Total Profiles Scanned: ${report.totalScanned}`);
  console.log(`- Explicit Citizen Profiles: ${report.counts.explicitCitizen}`);
  console.log(`- Explicit Approved Dual Responders: ${report.counts.explicitApprovedResponder}`);
  console.log(`- Explicit Pending Responders: ${report.counts.explicitPendingResponder}`);
  console.log(`- Ambiguous Legacy Profiles (QUARANTINED): ${report.counts.ambiguousManualReviewRequired}`);
  console.log(`- Command Staff Profiles: ${report.counts.commandStaff}`);
  console.log(`- Suspended Accounts: ${report.counts.suspended}`);
  console.log(`\n------------------------------------------------------`);
  console.log(`AUDIT CLASSIFICATION DETAILS:`);
  for (const item of report.auditLog) {
    console.log(`\nUID: ${item.uid} (${maskEmail(item.email)})`);
    console.log(`  Classification: ${item.classification}`);
    console.log(`  Action Taken:   ${item.actionTaken}`);
    console.log(`  Capabilities:   [${item.projected.capabilities.join(", ")}]`);
    console.log(`  Reason:         ${item.reason}`);
  }
  console.log(`\n======================================================\n`);
}
