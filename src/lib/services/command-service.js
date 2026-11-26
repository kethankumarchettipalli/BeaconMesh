import { collection, getDocs, getDoc, doc, query, where, limit, writeBatch, arrayUnion, serverTimestamp, } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
/**
 * Calculate genuine aggregate metrics directly from real incident records.
 * Never inserts hardcoded fake numbers.
 */
export function computeIncidentAggregates(incidents) {
    let active = 0;
    let pending = 0;
    let critical = 0;
    let resolved = 0;
    for (const inc of incidents) {
        const s = (inc.status || "").toUpperCase();
        const isResolved = s === "RESOLVED";
        const isCancelled = s === "CANCELLED";
        if (isResolved) {
            resolved++;
        }
        else if (s === "ACKNOWLEDGED" ||
            s === "IN PROGRESS" ||
            s === "DISPATCHED" ||
            s === "RESPONDER_ON_SCENE") {
            active++;
        }
        else if (s === "SAVED ON DEVICE" ||
            s === "WAITING FOR CONNECTION" ||
            s === "STORED_LOCALLY" ||
            s === "QUEUED_FOR_MESH" ||
            s === "SUBMITTED" ||
            s === "ROUTED_TO_GATEWAY") {
            pending++;
        }
        const sev = (inc.severity || "").toUpperCase();
        if (sev === "CRITICAL" && !isResolved && !isCancelled) {
            critical++;
        }
    }
    return {
        total: incidents.length,
        active,
        pending,
        critical,
        resolved,
    };
}
/**
 * Fetch real user directory for Command user management
 */
export async function getOperationalUserDirectory() {
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            const q = query(collection(db, "users"), limit(50));
            const snap = await getDocs(q);
            const list = [];
            snap.forEach((d) => {
                const data = d.data();
                list.push({
                    uid: data.uid,
                    displayName: data.displayName || "Unknown User",
                    role: data.role === "COMMAND"
                        ? data.commandLevel === "ADMINISTRATOR"
                            ? "Administrator"
                            : "Coordinator"
                        : data.role === "RESPONDER"
                            ? data.responderSubtype === "PROFESSIONAL"
                                ? "Professional responder"
                                : "Volunteer responder"
                            : "Citizen",
                    status: data.accountStatus === "ACTIVE" ? "Active" : "Suspended",
                    email: data.email,
                    commandLevel: data.commandLevel,
                    responderSubtype: data.responderSubtype,
                });
            });
            if (list.length > 0) {
                return list;
            }
        }
        catch (err) {
            console.info("[CommandService] User directory offline or restricted:", err);
        }
    }
    return [];
}
/**
 * Atomically assign an incident to a responder unit (Safeguard 3: Assignment Integrity).
 * Updates incident status, responder's dutyStatus & activeIncidentId in users/{uid},
 * and creates an authorized incidentAssignments audit record.
 */
export async function assignIncidentAtomic(incidentId, responderId, coordinatorUid) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    const batch = writeBatch(db);
    const now = serverTimestamp();
    // 1. Update Incident
    const incRef = doc(db, "incidents", incidentId);
    batch.update(incRef, {
        status: "In progress",
        assignedResponderId: responderId,
        assignedResponderIds: arrayUnion(responderId),
        updatedAt: now,
    });
    // 2. Update Responder User Profile
    const userRef = doc(db, "users", responderId);
    batch.update(userRef, {
        dutyStatus: "DISPATCHED",
        activeIncidentId: incidentId,
        updatedAt: now,
    });
    // 3. Create Assignment Audit Record
    const assignmentRef = doc(db, "incidentAssignments", `${incidentId}_${responderId}`);
    batch.set(assignmentRef, {
        id: `${incidentId}_${responderId}`,
        incidentId,
        responderId,
        status: "ACTIVE",
        assignedBy: coordinatorUid,
        assignedAt: now,
        updatedAt: now,
    });
    await batch.commit();
}
/**
 * Atomically resolve an incident and release the responder back to AVAILABLE status.
 */
export async function completeIncidentAtomic(incidentId, responderId) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    const batch = writeBatch(db);
    const now = serverTimestamp();
    // 1. Mark incident resolved
    const incRef = doc(db, "incidents", incidentId);
    batch.update(incRef, {
        status: "Resolved",
        updatedAt: now,
    });
    // 2. Release responder
    const userRef = doc(db, "users", responderId);
    batch.update(userRef, {
        dutyStatus: "AVAILABLE",
        activeIncidentId: null,
        updatedAt: now,
    });
    // 3. Update assignment record
    const assignmentRef = doc(db, "incidentAssignments", `${incidentId}_${responderId}`);
    batch.update(assignmentRef, {
        status: "COMPLETED",
        completedAt: now,
        updatedAt: now,
    });
    await batch.commit();
}
/**
 * Fetch pending responder applications for Command review.
 */
export async function fetchPendingResponderApplications() {
    if (!isFirebaseConfigured || !db) {
        return [];
    }
    try {
        const q = query(
            collection(db, "users"),
            where("responderApplicationStatus", "==", "PENDING"),
            limit(50)
        );
        const snap = await getDocs(q);
        const applications = [];
        snap.forEach((d) => {
            const data = d.data();
            applications.push({
                uid: data.uid,
                displayName: data.displayName || "Applicant",
                email: data.email || "",
                phoneNumber: data.phoneNumber || "",
                role: data.role || "CITIZEN",
                requestedRole: data.requestedRole,
                requestedResponderSubtype: data.requestedResponderSubtype || "VOLUNTEER",
                responderApplicationStatus: data.responderApplicationStatus,
                approvalStatus: data.approvalStatus,
                citizenEnrollmentStatus: data.citizenEnrollmentStatus,
                registrationPath: data.registrationPath,
                region: data.region || "",
                district: data.district || "",
                city: data.city || "",
                requestedUnit: data.requestedUnit || "GENERAL",
                organization: data.organization || "",
                designation: data.designation || "",
                experienceYears: data.experienceYears != null ? data.experienceYears : 0,
                credentialsSummary: data.credentialsSummary || "",
                accountStatus: data.accountStatus,
                emailVerified: Boolean(data.emailVerified),
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null,
            });
        });
        return applications;
    } catch (err) {
        console.warn("[CommandService] Failed to fetch pending applications:", err);
        return [];
    }
}
/**
 * Approve a pending responder application granting dual capability (v2.1 Architecture).
 * Validates applicant standing and atomically grants ['CITIZEN', 'RESPONDER'].
 * Atomically creates responder profile and an immutable review audit log record.
 */
export async function approveResponderApplication(applicantUid, coordinatorUid, options = {}) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    const userRef = doc(db, "users", applicantUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        throw new Error(`User ${applicantUid} not found`);
    }
    const applicant = snap.data();
    if (!applicant.emailVerified) {
        throw new Error("Cannot approve responder application: Email is not verified.");
    }
    if (applicant.accountStatus === "SUSPENDED") {
        throw new Error("Cannot approve responder application: Account is suspended.");
    }
    if (applicant.responderApplicationStatus !== "PENDING" || applicant.approvalStatus !== "PENDING") {
        throw new Error("Cannot approve responder application: Application is not in PENDING status.");
    }
    const reviewerRole = typeof options === "object" && options?.reviewerRole ? options.reviewerRole : "COORDINATOR";
    if (!["COORDINATOR", "ADMINISTRATOR"].includes(reviewerRole)) {
        throw new Error("Authorization error: Only Command staff (COORDINATOR or ADMINISTRATOR) can approve responder applications.");
    }
    const reviewerName = typeof options === "object" && options?.reviewerName ? String(options.reviewerName).trim() : null;
    const reviewerDesignation = typeof options === "object" && options?.reviewerDesignation
        ? String(options.reviewerDesignation).trim()
        : reviewerRole === "ADMINISTRATOR"
            ? "Command Administrator"
            : "Command Operations Coordinator";
    const subtype = typeof options === "string" ? options : options?.approvedSubtype || applicant.requestedResponderSubtype || "VOLUNTEER";
    const notes = typeof options === "object" && options?.notes ? options.notes : null;
    const now = serverTimestamp();
    const reviewId = `rev_${applicantUid}_${Date.now()}`;
    const batch = writeBatch(db);

    // 1. Dual capability granted on user profile
    batch.update(userRef, {
        capabilities: ["CITIZEN", "RESPONDER"],
        citizenEnrollmentStatus: "ACTIVE",
        approvalStatus: "APPROVED",
        responderApplicationStatus: "APPROVED",
        role: "RESPONDER",
        responderSubtype: subtype,
        dutyStatus: "OFF_DUTY",
        activeIncidentId: null,
        reviewedBy: coordinatorUid,
        approvedBy: coordinatorUid,
        reviewedAt: now,
        approvedAt: now,
        lastReviewId: reviewId,
        updatedAt: now,
    });

    // 2. Initialize or update responder profile
    const profileRef = doc(db, "responderProfiles", applicantUid);
    batch.set(profileRef, {
        uid: applicantUid,
        displayName: applicant.displayName || "Approved Responder",
        email: applicant.email,
        phoneNumber: applicant.phoneNumber || null,
        responderSubtype: subtype,
        availabilityStatus: "UNAVAILABLE",
        dutyStatus: "OFF_DUTY",
        operationalStatus: "Approved and awaiting field deployment",
        skills: ["First Aid", "Radio Mesh", "Field Search"],
        updatedAt: new Date().toISOString(),
    }, { merge: true });

    // 3. Create immutable audit record
    const reviewRef = doc(db, "responderApplicationReviews", reviewId);
    batch.set(reviewRef, {
        id: reviewId,
        applicantUid,
        applicantName: applicant.displayName || "Approved Responder",
        applicantEmail: applicant.email || "",
        decision: "APPROVED",
        requestedSubtype: applicant.requestedResponderSubtype || "VOLUNTEER",
        assignedSubtype: subtype,
        reviewerUid: coordinatorUid,
        reviewerName,
        reviewerRole,
        reviewerDesignation,
        previousStatus: "PENDING",
        newStatus: "APPROVED",
        rejectionReason: null,
        reviewerNotes: notes,
        reviewedAt: now,
    });

    await batch.commit();
    return { reviewId, status: "APPROVED" };
}
/**
 * Reject a pending responder application with audited reason.
 * Preserves Citizen capabilities if applicant had completed citizen enrollment.
 * Atomically writes the rejection decision and an immutable review audit log record.
 */
export async function rejectResponderApplication(applicantUid, coordinatorUid, reason, options = {}) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
        throw new Error("Rejection reason is mandatory.");
    }
    const userRef = doc(db, "users", applicantUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        throw new Error(`User ${applicantUid} not found`);
    }
    const applicant = snap.data();
    if (applicant.responderApplicationStatus !== "PENDING" || applicant.approvalStatus !== "PENDING") {
        throw new Error("Cannot reject responder application: Application is not in PENDING status.");
    }
    const reviewerRole = typeof options === "object" && options?.reviewerRole ? options.reviewerRole : "COORDINATOR";
    if (!["COORDINATOR", "ADMINISTRATOR"].includes(reviewerRole)) {
        throw new Error("Authorization error: Only Command staff (COORDINATOR or ADMINISTRATOR) can reject responder applications.");
    }
    const reviewerName = typeof options === "object" && options?.reviewerName ? String(options.reviewerName).trim() : null;
    const reviewerDesignation = typeof options === "object" && options?.reviewerDesignation
        ? String(options.reviewerDesignation).trim()
        : reviewerRole === "ADMINISTRATOR"
            ? "Command Administrator"
            : "Command Operations Coordinator";
    const notes = typeof options === "object" && options?.notes ? options.notes : null;
    const now = serverTimestamp();
    const reviewId = `rev_${applicantUid}_${Date.now()}`;
    // If applicant had active citizen status, preserve citizen capability
    const hadCitizen = applicant.citizenEnrollmentStatus === "ACTIVE";
    const nextCapabilities = hadCitizen ? ["CITIZEN"] : [];
    const batch = writeBatch(db);

    // 1. Rejection state transition on user profile
    batch.update(userRef, {
        capabilities: nextCapabilities,
        approvalStatus: "REJECTED",
        responderApplicationStatus: "REJECTED",
        role: "CITIZEN",
        responderSubtype: null,
        rejectionReason: reason.trim(),
        reviewedBy: coordinatorUid,
        reviewedAt: now,
        lastReviewId: reviewId,
        updatedAt: now,
    });

    // 2. Create immutable audit record
    const reviewRef = doc(db, "responderApplicationReviews", reviewId);
    batch.set(reviewRef, {
        id: reviewId,
        applicantUid,
        applicantName: applicant.displayName || "Applicant",
        applicantEmail: applicant.email || "",
        decision: "REJECTED",
        requestedSubtype: applicant.requestedResponderSubtype || "VOLUNTEER",
        assignedSubtype: null,
        reviewerUid: coordinatorUid,
        reviewerName,
        reviewerRole,
        reviewerDesignation,
        previousStatus: "PENDING",
        newStatus: "REJECTED",
        rejectionReason: reason.trim(),
        reviewerNotes: notes,
        reviewedAt: now,
    });

    await batch.commit();
    return { reviewId, status: "REJECTED" };
}
