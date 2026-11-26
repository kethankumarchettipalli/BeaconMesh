/**
 * Pure read-time normalization for UserProfile documents.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. ZERO SIDE-EFFECTS: Never performs writes to Firestore during read operations.
 * 2. MANDATORY SAFEGUARD 1: Zero citizen incidents or bookmarks must NEVER be treated
 *    as proof of Responder-only registration. Only trustworthy explicit registration evidence
 *    may establish registration history. Otherwise, the profile is classified as
 *    AMBIGUOUS_MANUAL_REVIEW_REQUIRED and quarantined to capabilities: [] until an
 *    administrator explicitly reviews and resolves it.
 */
export function normalizeUserProfile(raw) {
    return normalizeUserProfileWithMeta(raw).profile;
}
export function normalizeUserProfileWithMeta(raw) {
    if (!raw || typeof raw !== "object") {
        throw new Error("Invalid raw user profile document: expected object");
    }
    const role = raw.role || "CITIZEN";
    const approvalStatus = raw.approvalStatus || "NOT_REQUIRED";
    const requestedRole = raw.requestedRole || null;
    let migrationStatus = "MIGRATED_STANDARD_CITIZEN";
    let isAmbiguous = false;
    // 1. Explicit registrationPath if trustworthy
    let registrationPath = raw.registrationPath;
    let citizenEnrollmentStatus = raw.citizenEnrollmentStatus;
    let capabilities = Array.isArray(raw.capabilities) ? [...raw.capabilities] : [];
    // Check if profile is an explicit Command account
    if (role === "COMMAND") {
        migrationStatus = "MIGRATED_COMMAND";
        registrationPath = raw.registrationPath || "COMMAND";
        // Check if profile has Citizen capability
        const hasExplicitCitizen = (Array.isArray(raw.capabilities) && raw.capabilities.includes("CITIZEN")) ||
            raw.citizenEnrollmentStatus === "ACTIVE";
        // Check if profile has approved Responder capability
        const hasApprovedResponder = (Array.isArray(raw.capabilities) && raw.capabilities.includes("RESPONDER")) ||
            (raw.approvalStatus === "APPROVED" && (raw.role === "RESPONDER" || raw.requestedRole === "RESPONDER"));
        capabilities = [];
        if (hasExplicitCitizen && raw.citizenEnrollmentStatus !== "INACTIVE") {
            citizenEnrollmentStatus = "ACTIVE";
            capabilities.push("CITIZEN");
        }
        else {
            citizenEnrollmentStatus = "INACTIVE";
        }
        if (hasApprovedResponder) {
            capabilities.push("RESPONDER");
        }
    }
    // Check if profile is an approved dual-capability Responder
    else if (role === "RESPONDER" && approvalStatus === "APPROVED") {
        migrationStatus = "MIGRATED_APPROVED_RESPONDER";
        citizenEnrollmentStatus = "ACTIVE";
        capabilities = ["CITIZEN", "RESPONDER"];
        registrationPath = raw.registrationPath || "RESPONDER";
    }
    // Check if standard Citizen (never applied for responder)
    else if (role === "CITIZEN" && !requestedRole && approvalStatus === "NOT_REQUIRED") {
        migrationStatus = "MIGRATED_STANDARD_CITIZEN";
        citizenEnrollmentStatus = "ACTIVE";
        capabilities = ["CITIZEN"];
        registrationPath = "CITIZEN";
    }
    // Check pending responder application cases
    else if (role === "CITIZEN" && requestedRole === "RESPONDER" && approvalStatus === "PENDING") {
        // Check if there is trustworthy, explicit registration evidence
        if (raw.registrationPath === "RESPONDER") {
            // Explicit responder signup path
            migrationStatus = "MIGRATED_EXPLICIT_RESPONDER_PENDING";
            registrationPath = "RESPONDER";
            citizenEnrollmentStatus = "INACTIVE";
            capabilities = [];
        }
        else if (raw.registrationPath === "CITIZEN" || raw.citizenEnrollmentStatus === "ACTIVE") {
            // Citizen who subsequently applied for responder track
            migrationStatus = "MIGRATED_EXPLICIT_CITIZEN_PENDING";
            registrationPath = "CITIZEN";
            citizenEnrollmentStatus = "ACTIVE";
            capabilities = ["CITIZEN"];
        }
        else {
            // AMBIGUOUS: Lack of trustworthy explicit evidence.
            // MANDATORY SAFEGUARD 1: Never treat lack of reports/bookmarks as proof!
            // Must classify as AMBIGUOUS_MANUAL_REVIEW_REQUIRED and quarantine capabilities to []
            // to prevent accidental capability elevation.
            migrationStatus = "AMBIGUOUS_MANUAL_REVIEW_REQUIRED";
            isAmbiguous = true;
            registrationPath = "RESPONDER"; // default to safe path
            citizenEnrollmentStatus = "INACTIVE";
            capabilities = [];
        }
    }
    else {
        // Fallback for rejected or other combinations
        if (raw.citizenEnrollmentStatus === "ACTIVE" || raw.registrationPath === "CITIZEN") {
            citizenEnrollmentStatus = "ACTIVE";
            capabilities = ["CITIZEN"];
        }
        else {
            citizenEnrollmentStatus = "INACTIVE";
            capabilities = [];
        }
    }
    // Ensure capabilities strictly contains only CITIZEN and/or RESPONDER (COMMAND is never a capability)
    capabilities = Array.from(new Set(capabilities)).filter((c) => c === "CITIZEN" || c === "RESPONDER");
    // Determine Responder Duty Status (only valid for accounts with RESPONDER capability)
    let dutyStatus = undefined;
    if (capabilities.includes("RESPONDER") || role === "RESPONDER") {
        dutyStatus = raw.dutyStatus || "OFF_DUTY";
    }
    const responderApplicationStatus = raw.responderApplicationStatus ||
        (requestedRole === "RESPONDER"
            ? approvalStatus
            : "NOT_APPLIED");
    const normalizedProfile = {
        ...raw,
        uid: raw.uid || "",
        displayName: raw.displayName || "User",
        email: raw.email || "",
        photoURL: raw.photoURL || null,
        role,
        capabilities,
        citizenEnrollmentStatus,
        responderApplicationStatus,
        registrationPath: registrationPath || "CITIZEN",
        responderSubtype: raw.responderSubtype || null,
        commandLevel: raw.commandLevel || null,
        requestedRole,
        requestedResponderSubtype: raw.requestedResponderSubtype || null,
        approvalStatus,
        migrationStatus,
        dutyStatus,
        activeIncidentId: raw.activeIncidentId || null,
        phoneNumber: raw.phoneNumber || null,
        phoneVerified: Boolean(raw.phoneVerified),
        emailVerified: Boolean(raw.emailVerified),
        emailVerifiedAt: raw.emailVerifiedAt || null,
        accountStatus: raw.accountStatus || "ACTIVE",
        region: raw.region || null,
        district: raw.district || null,
        city: raw.city || null,
        organization: raw.organization || null,
        requestedUnit: raw.requestedUnit || null,
        designation: raw.designation || null,
        experienceYears: raw.experienceYears != null ? Number(raw.experienceYears) : null,
        credentialsSummary: raw.credentialsSummary || null,
        reviewedBy: raw.reviewedBy || null,
        reviewedAt: raw.reviewedAt || null,
        rejectionReason: raw.rejectionReason || null,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        lastLoginAt: raw.lastLoginAt || undefined,
    };
    return {
        profile: normalizedProfile,
        migrationStatus,
        isAmbiguous,
    };
}
