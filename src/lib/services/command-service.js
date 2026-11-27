import { collection, getDocs, getDoc, doc, query, where, orderBy, limit, writeBatch, runTransaction, onSnapshot, serverTimestamp, setDoc, updateDoc, Timestamp, } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { getLocalDb } from "../db/dexie-db";
import {
    NOTIFICATION_EVENTS,
    createNotificationIdempotent,
    notifyCommandUsers,
} from "./notification-service";
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
        const isResolved = s === "RESOLVED" || s === "CLOSED";
        const isCancelled = s === "CANCELLED";
        if (isResolved) {
            resolved++;
        }
        else if (s === "ACKNOWLEDGED" ||
            s === "IN PROGRESS" ||
            s === "EN ROUTE" ||
            s === "ON SCENE" ||
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
 * Fetch real user directory for Command user management.
 * Enforces role-scoped queries:
 * - ADMINISTRATOR: all authorized user accounts
 * - COORDINATOR: RESPONDER accounts only (no Citizens, Administrators, or other Coordinators)
 */
export async function getOperationalUserDirectory(callerRole = "ADMINISTRATOR") {
    if (!["ADMINISTRATOR", "COORDINATOR"].includes(callerRole)) {
        return [];
    }
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            const q = callerRole === "COORDINATOR"
                ? query(collection(db, "users"), where("role", "==", "RESPONDER"), limit(50))
                : query(collection(db, "users"), limit(100));
            const snap = await getDocs(q);
            const list = [];
            snap.forEach((d) => {
                const data = d.data();
                if (callerRole === "COORDINATOR" && data.role !== "RESPONDER") {
                    return;
                }
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
                    rawRole: data.role,
                    status: data.accountStatus === "ACTIVE" ? "Active" : "Suspended",
                    accountStatus: data.accountStatus || "ACTIVE",
                    email: data.email || "",
                    phoneNumber: data.phoneNumber || null,
                    region: data.region || null,
                    district: data.district || null,
                    city: data.city || null,
                    commandLevel: data.commandLevel || null,
                    responderSubtype: data.responderSubtype || null,
                    requestedUnit: data.requestedUnit || null,
                    organization: data.organization || null,
                    designation: data.designation || null,
                    experienceYears: data.experienceYears ?? null,
                    credentialsSummary: data.credentialsSummary || null,
                    approvalStatus: data.approvalStatus || "NOT_REQUIRED",
                    responderApplicationStatus: data.responderApplicationStatus || "NOT_APPLIED",
                    citizenEnrollmentStatus: data.citizenEnrollmentStatus || "ACTIVE",
                    capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
                    emailVerified: Boolean(data.emailVerified),
                    dutyStatus: data.dutyStatus || null,
                    activeIncidentId: data.activeIncidentId || null,
                    lastReviewId: data.lastReviewId || null,
                    invitationId: data.invitationId || null,
                    invitedByUid: data.invitedByUid || null,
                    createdAtIso: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
                });
            });
            return list;
        }
        catch (err) {
            console.info("[CommandService] User directory offline or restricted:", err);
        }
    }
    return [];
}
export const RESPONDER_FIELD_SEQUENCE = [
    "Acknowledged",
    "En route",
    "On scene",
    "In progress",
    "Resolved",
];

/**
 * Atomically assign an incident to an eligible professional responder.
 * Enforces eligibility, availability, and conflict-free assignment via Firestore transaction.
 */
export async function assignIncidentAtomic(incidentId, responderId, coordinatorUid, options = {}) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    if (!incidentId || !responderId) {
        throw new Error("Incident ID and Responder ID are required.");
    }
    const incRef = doc(db, "incidents", incidentId);
    const userRef = doc(db, "users", responderId);
    const assignmentId = `${incidentId}_${responderId}`;
    const assignmentRef = doc(db, "incidentAssignments", assignmentId);
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timelineRef = doc(db, "incidents", incidentId, "timeline", eventId);

    const result = await runTransaction(db, async (tx) => {
        const [incSnap, userSnap, existingAsgSnap] = await Promise.all([
            tx.get(incRef),
            tx.get(userRef),
            tx.get(assignmentRef),
        ]);
        if (!incSnap.exists()) {
            throw new Error("Incident record not found.");
        }
        if (!userSnap.exists()) {
            throw new Error("Responder profile not found.");
        }
        const incData = incSnap.data();
        const userData = userSnap.data();

        if (["Resolved", "Closed", "Cancelled"].includes(incData.status)) {
            throw new Error(`Cannot dispatch incident in "${incData.status}" state.`);
        }
        if (userData.accountStatus !== "ACTIVE") {
            throw new Error("Responder account is not ACTIVE.");
        }
        const isApproved = userData.role === "RESPONDER" && userData.approvalStatus === "APPROVED";
        if (!isApproved) {
            throw new Error("Selected user is not an approved responder.");
        }
        if (userData.responderSubtype && userData.responderSubtype !== "PROFESSIONAL") {
            throw new Error("Primary Command dispatch is restricted to Professional responders.");
        }
        if (userData.dutyStatus !== "AVAILABLE" || userData.activeIncidentId) {
            throw new Error(`Responder is currently ${userData.dutyStatus || "UNAVAILABLE"} and cannot be dispatched.`);
        }
        if (incData.assignedResponderId && incData.assignedResponderId !== responderId) {
            const prevAsgRef = doc(db, "incidentAssignments", `${incidentId}_${incData.assignedResponderId}`);
            const prevAsgSnap = await tx.get(prevAsgRef);
            if (prevAsgSnap.exists() && prevAsgSnap.data().status === "ACTIVE") {
                throw new Error("Incident already has an active responder assignment.");
            }
        }
        if (existingAsgSnap.exists() && existingAsgSnap.data().status === "ACTIVE") {
            throw new Error("This responder is already actively assigned to this incident.");
        }

        const now = serverTimestamp();
        const responderName = options.responderName || userData.displayName || "Professional Responder";

        tx.update(incRef, {
            status: "Acknowledged",
            assignedResponderId: responderId,
            updatedAt: now,
        });
        tx.update(userRef, {
            dutyStatus: "DISPATCHED",
            activeIncidentId: incidentId,
            updatedAt: now,
        });
        tx.set(assignmentRef, {
            id: assignmentId,
            incidentId,
            responderId,
            responderName,
            status: "ACTIVE",
            acceptanceStatus: "OFFERED",
            previousDutyStatus: userData.dutyStatus || "AVAILABLE",
            assignedBy: coordinatorUid,
            assignedAt: now,
            updatedAt: now,
        });
        tx.set(timelineRef, {
            id: eventId,
            incidentId,
            eventType: "DISPATCH_CREATED",
            actorUid: coordinatorUid,
            actorRole: "COMMAND",
            details: `Dispatched to ${responderName} (${responderId})`,
            createdAt: now,
        });

        return {
            assignmentId,
            responderName,
            citizenUid: incData.createdBy || null,
            incidentType: incData.type || "Emergency",
            priority: incData.priority || "High",
        };
    });

    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.incidents.update(incidentId, {
                status: "Acknowledged",
                assignedResponderId: responderId,
                assignedResponderIds: [responderId],
                syncStatus: "SYNCED",
                updatedAt: new Date().toISOString(),
            });
        } catch {
            // ignore local cache update failure
        }
    }

    const notifPriority = String(result.priority || "").toUpperCase() === "CRITICAL" ? "CRITICAL" : "HIGH";
    void createNotificationIdempotent({
        recipientUid: responderId,
        eventType: NOTIFICATION_EVENTS.ASSIGNMENT_OFFERED,
        title: `New dispatch: ${incidentId}`,
        message: `You have been assigned to ${result.incidentType} incident ${incidentId}. Accept or decline in Field Operations.`,
        incidentId,
        priority: notifPriority,
        sourceActorUid: coordinatorUid,
        dedupKey: `ASSIGNMENT_OFFERED:${incidentId}:${responderId}`,
        metadata: { assignmentId: result.assignmentId },
    });
    if (result.citizenUid && result.citizenUid !== responderId) {
        void createNotificationIdempotent({
            recipientUid: result.citizenUid,
            eventType: NOTIFICATION_EVENTS.RESPONDER_ASSIGNED,
            title: `Responder dispatched (${incidentId})`,
            message: `A field responder has been assigned to your ${result.incidentType} report.`,
            incidentId,
            priority: "HIGH",
            sourceActorUid: coordinatorUid,
            dedupKey: `RESPONDER_ASSIGNED:${incidentId}:${responderId}`,
            metadata: { assignmentId: result.assignmentId },
        });
    }
    return { assignmentId: result.assignmentId, responderName: result.responderName };
}

/**
 * Subscribe to the active or latest assignment for a responder on an incident.
 */
export function subscribeToResponderAssignments(responderId, onUpdate, onError) {
    if (!isFirebaseConfigured || !db || !responderId) {
        onUpdate([]);
        return () => {};
    }
    try {
        const q = query(
            collection(db, "incidentAssignments"),
            where("responderId", "==", responderId),
            limit(25)
        );
        return onSnapshot(
            q,
            (snap) => {
                const list = [];
                snap.forEach((d) => list.push(d.data()));
                onUpdate(list);
            },
            (err) => {
                if (onError) onError(err);
            }
        );
    } catch (err) {
        if (onError) onError(err);
        return () => {};
    }
}

/**
 * Subscribe to assignments for a specific incident (Command Operations view).
 */
export function subscribeToIncidentAssignments(incidentId, onUpdate, onError) {
    if (!isFirebaseConfigured || !db || !incidentId) {
        onUpdate([]);
        return () => {};
    }
    try {
        const q = query(
            collection(db, "incidentAssignments"),
            where("incidentId", "==", incidentId),
            limit(20)
        );
        return onSnapshot(
            q,
            (snap) => {
                const list = [];
                snap.forEach((d) => list.push(d.data()));
                onUpdate(list);
            },
            (err) => {
                if (onError) onError(err);
            }
        );
    } catch (err) {
        if (onError) onError(err);
        return () => {};
    }
}

/**
 * Responder accepts or declines an offered dispatch assignment atomically.
 */
export async function respondToAssignmentOffer(incidentId, responderId, decision, declineReason = null) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    if (!["ACCEPTED", "DECLINED"].includes(decision)) {
        throw new Error("Decision must be ACCEPTED or DECLINED.");
    }
    const assignmentId = `${incidentId}_${responderId}`;
    const assignmentRef = doc(db, "incidentAssignments", assignmentId);
    const userRef = doc(db, "users", responderId);
    const incRef = doc(db, "incidents", incidentId);
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timelineRef = doc(db, "incidents", incidentId, "timeline", eventId);

    const txMeta = await runTransaction(db, async (tx) => {
        const [asgSnap, userSnap, incSnap] = await Promise.all([
            tx.get(assignmentRef),
            tx.get(userRef),
            tx.get(incRef),
        ]);
        if (!asgSnap.exists()) {
            throw new Error("Assignment offer not found.");
        }
        const asg = asgSnap.data();
        if (asg.responderId !== responderId) {
            throw new Error("Only the assigned responder can respond to this offer.");
        }
        if (asg.status !== "ACTIVE" || (asg.acceptanceStatus && asg.acceptanceStatus !== "OFFERED")) {
            throw new Error(`Assignment cannot be ${decision.toLowerCase()} in its current state.`);
        }
        if (!userSnap.exists() || !incSnap.exists()) {
            throw new Error("Referenced responder or incident record is missing.");
        }
        const incData = incSnap.data();
        const now = serverTimestamp();

        if (decision === "ACCEPTED") {
            tx.update(assignmentRef, {
                acceptanceStatus: "ACCEPTED",
                fieldStatus: "Acknowledged",
                respondedAt: now,
                updatedAt: now,
            });
            tx.update(incRef, {
                status: "Acknowledged",
                updatedAt: now,
            });
            tx.set(timelineRef, {
                id: eventId,
                incidentId,
                eventType: "ASSIGNMENT_ACCEPTED",
                actorUid: responderId,
                actorRole: "RESPONDER",
                details: "Responder accepted dispatch assignment.",
                createdAt: now,
            });
        } else {
            const cleanReason = (declineReason || "Responder declined dispatch").trim().slice(0, 300);
            tx.update(assignmentRef, {
                status: "DECLINED",
                acceptanceStatus: "DECLINED",
                declineReason: cleanReason,
                respondedAt: now,
                updatedAt: now,
            });
            tx.update(userRef, {
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
                updatedAt: now,
            });
            tx.set(timelineRef, {
                id: eventId,
                incidentId,
                eventType: "ASSIGNMENT_DECLINED",
                actorUid: responderId,
                actorRole: "RESPONDER",
                details: `Assignment declined: ${cleanReason}`,
                createdAt: now,
            });
        }
        return {
            citizenUid: incData.createdBy || null,
            responderName: asg.responderName || userSnap.data().displayName || "Responder",
        };
    });

    if (decision === "ACCEPTED") {
        if (txMeta.citizenUid && txMeta.citizenUid !== responderId) {
            void createNotificationIdempotent({
                recipientUid: txMeta.citizenUid,
                eventType: NOTIFICATION_EVENTS.ASSIGNMENT_ACCEPTED,
                title: `Responder accepted (${incidentId})`,
                message: `Your assigned responder has accepted dispatch for incident ${incidentId}.`,
                incidentId,
                priority: "HIGH",
                sourceActorUid: responderId,
                dedupKey: `ASSIGNMENT_ACCEPTED:${incidentId}:${responderId}`,
            });
        }
        void notifyCommandUsers({
            eventType: NOTIFICATION_EVENTS.ASSIGNMENT_ACCEPTED,
            title: `Assignment accepted (${incidentId})`,
            message: `${txMeta.responderName} accepted dispatch for incident ${incidentId}.`,
            incidentId,
            priority: "NORMAL",
            sourceActorUid: responderId,
            excludeActorUid: responderId,
            dedupKey: `ASSIGNMENT_ACCEPTED:${incidentId}:${responderId}`,
        });
    } else if (decision === "DECLINED") {
        void notifyCommandUsers({
            eventType: NOTIFICATION_EVENTS.ASSIGNMENT_DECLINED,
            title: `Assignment declined (${incidentId})`,
            message: `${txMeta.responderName} declined dispatch for incident ${incidentId}. Reassignment needed.`,
            incidentId,
            priority: "CRITICAL",
            sourceActorUid: responderId,
            excludeActorUid: responderId,
            dedupKey: `ASSIGNMENT_DECLINED:${incidentId}:${responderId}`,
        });
        const localDb = getLocalDb();
        if (localDb) {
            try {
                await localDb.responderProfiles.update(responderId, {
                    availabilityStatus: "AVAILABLE",
                    updatedAt: new Date().toISOString(),
                });
            } catch {
                // ignore
            }
        }
    }
}

/**
 * Advance responder field status along the canonical sequence without skipping prohibited steps.
 */
export async function updateResponderFieldProgress(incidentId, responderId, nextStatus, notes = null, restoreDutyStatus = "AVAILABLE") {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    if (!RESPONDER_FIELD_SEQUENCE.includes(nextStatus) || nextStatus === "Acknowledged") {
        throw new Error(`Invalid field status "${nextStatus}".`);
    }
    if (nextStatus === "Resolved") {
        return completeIncidentAtomic(incidentId, responderId, notes, restoreDutyStatus);
    }

    const incRef = doc(db, "incidents", incidentId);
    const asgRef = doc(db, "incidentAssignments", `${incidentId}_${responderId}`);
    const userRef = doc(db, "users", responderId);
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timelineRef = doc(db, "incidents", incidentId, "timeline", eventId);

    const eventTypeMap = {
        "Acknowledged": "ASSIGNMENT_ACCEPTED",
        "En route": "RESPONDER_EN_ROUTE",
        "On scene": "RESPONDER_ON_SCENE",
        "In progress": "ASSISTANCE_STARTED",
    };

    const txMeta = await runTransaction(db, async (tx) => {
        const [incSnap, asgSnap, userSnap] = await Promise.all([
            tx.get(incRef),
            tx.get(asgRef),
            tx.get(userRef),
        ]);
        if (!incSnap.exists() || !asgSnap.exists() || !userSnap.exists()) {
            throw new Error("Incident, assignment, or responder record not found.");
        }
        const inc = incSnap.data();
        const asg = asgSnap.data();
        if (inc.assignedResponderId !== responderId || asg.responderId !== responderId) {
            throw new Error("You are not assigned to this incident.");
        }
        if (asg.status !== "ACTIVE") {
            throw new Error("Assignment is no longer active.");
        }
        if (asg.acceptanceStatus === "OFFERED") {
            throw new Error("Accept the dispatch assignment before updating field progress.");
        }
        if (inc.status === "Closed" || inc.status === "Resolved") {
            throw new Error(`Incident is already ${inc.status}.`);
        }
        const currentField = asg.fieldStatus || inc.status || "Acknowledged";
        const currentIdx = RESPONDER_FIELD_SEQUENCE.indexOf(currentField);
        const nextIdx = RESPONDER_FIELD_SEQUENCE.indexOf(nextStatus);
        if (currentIdx !== -1 && nextIdx <= currentIdx) {
            throw new Error(`Cannot transition from "${currentField}" to "${nextStatus}".`);
        }
        if (currentIdx !== -1 && nextIdx > currentIdx + 1) {
            throw new Error(`Cannot skip from "${currentField}" directly to "${nextStatus}".`);
        }

        const now = serverTimestamp();
        const nextDutyStatus = nextStatus === "En route" ? "DISPATCHED" : "ON_SCENE";
        const incUpdate = { status: nextStatus, updatedAt: now };
        const asgUpdate = { fieldStatus: nextStatus, updatedAt: now };
        if (notes && notes.trim()) {
            incUpdate.notes = notes.trim();
            asgUpdate.notes = notes.trim();
        }

        tx.update(incRef, incUpdate);
        tx.update(asgRef, asgUpdate);
        tx.update(userRef, { dutyStatus: nextDutyStatus, updatedAt: now });
        tx.set(timelineRef, {
            id: eventId,
            incidentId,
            eventType: eventTypeMap[nextStatus] || "FIELD_PROGRESS",
            actorUid: responderId,
            actorRole: "RESPONDER",
            details: notes && notes.trim() ? `${nextStatus}: ${notes.trim()}` : `Status updated to ${nextStatus}`,
            createdAt: now,
        });
        return {
            citizenUid: inc.createdBy || null,
            eventType: eventTypeMap[nextStatus] || "ASSISTANCE_STARTED",
        };
    });

    const localDb = getLocalDb();
    if (localDb) {
        try {
            const localUpdates = {
                status: nextStatus,
                syncStatus: "SYNCED",
                updatedAt: new Date().toISOString(),
            };
            if (notes && notes.trim()) localUpdates.notes = notes.trim();
            await localDb.incidents.update(incidentId, localUpdates);
        } catch {
            // ignore
        }
    }

    const stepLabels = {
        "En route": "Responder is en route",
        "On scene": "Responder arrived on scene",
        "In progress": "Assistance in progress",
    };
    const title = `${stepLabels[nextStatus] || nextStatus} (${incidentId})`;
    if (txMeta.citizenUid && txMeta.citizenUid !== responderId) {
        void createNotificationIdempotent({
            recipientUid: txMeta.citizenUid,
            eventType: txMeta.eventType,
            title,
            message: `Update on your report ${incidentId}: ${stepLabels[nextStatus] || nextStatus}.`,
            incidentId,
            priority: "HIGH",
            sourceActorUid: responderId,
            dedupKey: `${txMeta.eventType}:${incidentId}:${responderId}`,
        });
    }
    void notifyCommandUsers({
        eventType: txMeta.eventType,
        title,
        message: `Incident ${incidentId} field status updated to ${nextStatus}.`,
        incidentId,
        priority: "NORMAL",
        sourceActorUid: responderId,
        excludeActorUid: responderId,
        dedupKey: `${txMeta.eventType}:${incidentId}:${responderId}`,
    });
}

/**
 * Atomically resolve an incident and restore the responder's duty status.
 */
export async function completeIncidentAtomic(incidentId, responderId, resolutionNotes = null, restoreDutyStatus = "AVAILABLE") {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    const targetDuty = ["AVAILABLE", "UNAVAILABLE", "OFF_DUTY"].includes(restoreDutyStatus)
        ? restoreDutyStatus
        : "AVAILABLE";
    const incRef = doc(db, "incidents", incidentId);
    const userRef = doc(db, "users", responderId);
    const assignmentRef = doc(db, "incidentAssignments", `${incidentId}_${responderId}`);
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timelineRef = doc(db, "incidents", incidentId, "timeline", eventId);

    const txMeta = await runTransaction(db, async (tx) => {
        const [incSnap, userSnap, asgSnap] = await Promise.all([
            tx.get(incRef),
            tx.get(userRef),
            tx.get(assignmentRef),
        ]);
        if (!incSnap.exists() || !userSnap.exists() || !asgSnap.exists()) {
            throw new Error("Incident, responder, or assignment record not found.");
        }
        const inc = incSnap.data();
        const asg = asgSnap.data();
        const userData = userSnap.data();
        if (inc.assignedResponderId !== responderId || asg.responderId !== responderId) {
            throw new Error("You are not assigned to this incident.");
        }
        if (asg.status !== "ACTIVE") {
            throw new Error("Assignment is no longer active.");
        }
        if (asg.acceptanceStatus !== "ACCEPTED") {
            throw new Error("Accept the dispatch assignment before submitting resolution.");
        }
        if (inc.status === "Resolved" || inc.status === "Closed") {
            throw new Error(`Incident is already ${inc.status}.`);
        }
        const currentField = asg.fieldStatus || inc.status || "Acknowledged";
        if (currentField !== "In progress") {
            throw new Error(`Cannot resolve incident from "${currentField}". Complete "In progress" first.`);
        }
        const currentDuty = userData.dutyStatus;
        const preservedDuty = currentDuty === "OFF_DUTY"
            ? "OFF_DUTY"
            : currentDuty === "UNAVAILABLE"
                ? "UNAVAILABLE"
                : targetDuty;
        const now = serverTimestamp();
        const incUpdate = { status: "Resolved", updatedAt: now };
        if (resolutionNotes && resolutionNotes.trim()) {
            incUpdate.notes = resolutionNotes.trim();
        }
        tx.update(incRef, incUpdate);
        tx.update(userRef, {
            dutyStatus: preservedDuty,
            activeIncidentId: null,
            updatedAt: now,
        });
        const asgUpdate = {
            status: "COMPLETED",
            fieldStatus: "Resolved",
            completedAt: now,
            updatedAt: now,
        };
        if (resolutionNotes && resolutionNotes.trim()) {
            asgUpdate.notes = resolutionNotes.trim();
        }
        tx.update(assignmentRef, asgUpdate);
        tx.set(timelineRef, {
            id: eventId,
            incidentId,
            eventType: "RESOLUTION_SUBMITTED",
            actorUid: responderId,
            actorRole: "RESPONDER",
            details: resolutionNotes && resolutionNotes.trim()
                ? `Resolution submitted: ${resolutionNotes.trim()}`
                : "Responder submitted incident resolution.",
            createdAt: now,
        });
        return { preservedDuty, citizenUid: inc.createdBy || null };
    });

    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.incidents.update(incidentId, {
                status: "Resolved",
                syncStatus: "SYNCED",
                resolvedAt: new Date().toISOString(),
                ...(resolutionNotes && resolutionNotes.trim() ? { notes: resolutionNotes.trim(), resolutionDetails: resolutionNotes.trim() } : {}),
                updatedAt: new Date().toISOString(),
            });
            await localDb.responderProfiles.update(responderId, {
                availabilityStatus: targetDuty === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
                updatedAt: new Date().toISOString(),
            });
        } catch {
            // ignore
        }
    }

    if (txMeta.citizenUid && txMeta.citizenUid !== responderId) {
        void createNotificationIdempotent({
            recipientUid: txMeta.citizenUid,
            eventType: NOTIFICATION_EVENTS.RESOLUTION_SUBMITTED,
            title: `Resolution submitted (${incidentId})`,
            message: `The responder has submitted resolution for incident ${incidentId}. Awaiting Command verification.`,
            incidentId,
            priority: "HIGH",
            sourceActorUid: responderId,
            dedupKey: `RESOLUTION_SUBMITTED:${incidentId}`,
        });
    }
    void notifyCommandUsers({
        eventType: NOTIFICATION_EVENTS.RESOLUTION_SUBMITTED,
        title: `Resolution awaiting verification (${incidentId})`,
        message: `Responder submitted resolution for incident ${incidentId}. Verify and close in Command Incidents.`,
        incidentId,
        priority: "HIGH",
        sourceActorUid: responderId,
        excludeActorUid: responderId,
        dedupKey: `RESOLUTION_SUBMITTED:${incidentId}`,
    });
}

/**
 * Command Operations verification and closure of a resolved (or active) incident.
 */
export async function verifyAndCloseIncident(incidentId, coordinatorUid, closingNotes = null) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firebase is not configured");
    }
    const incRef = doc(db, "incidents", incidentId);
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timelineRef = doc(db, "incidents", incidentId, "timeline", eventId);

    const txMeta = await runTransaction(db, async (tx) => {
        const incSnap = await tx.get(incRef);
        if (!incSnap.exists()) {
            throw new Error("Incident not found.");
        }
        const inc = incSnap.data();
        if (inc.status === "Closed") {
            throw new Error("Incident is already closed.");
        }
        if (inc.status !== "Resolved") {
            throw new Error(`Incident must be Resolved before Command can verify and close it (current status: "${inc.status}").`);
        }
        const now = serverTimestamp();
        const incUpdate = { status: "Closed", updatedAt: now };
        if (closingNotes && closingNotes.trim()) {
            incUpdate.notes = closingNotes.trim();
        }
        if (inc.assignedResponderId) {
            const respRef = doc(db, "users", inc.assignedResponderId);
            const asgRef = doc(db, "incidentAssignments", `${incidentId}_${inc.assignedResponderId}`);
            const [respSnap, asgSnap] = await Promise.all([tx.get(respRef), tx.get(asgRef)]);
            tx.update(incRef, incUpdate);
            if (respSnap.exists() && respSnap.data().activeIncidentId === incidentId) {
                const respDuty = respSnap.data().dutyStatus;
                const priorDuty = asgSnap.exists() ? asgSnap.data().previousDutyStatus : null;
                const restoredDuty = respDuty === "OFF_DUTY"
                    ? "OFF_DUTY"
                    : respDuty === "UNAVAILABLE"
                        ? "UNAVAILABLE"
                        : priorDuty && ["OFF_DUTY", "UNAVAILABLE", "AVAILABLE"].includes(priorDuty)
                            ? priorDuty
                            : "AVAILABLE";
                tx.update(respRef, { dutyStatus: restoredDuty, activeIncidentId: null, updatedAt: now });
            }
            if (asgSnap.exists() && asgSnap.data().status === "ACTIVE") {
                tx.update(asgRef, { status: "COMPLETED", fieldStatus: "Resolved", completedAt: now, updatedAt: now });
            }
        }
        else {
            tx.update(incRef, incUpdate);
        }
        tx.set(timelineRef, {
            id: eventId,
            incidentId,
            eventType: "INCIDENT_CLOSED",
            actorUid: coordinatorUid,
            actorRole: "COMMAND",
            details: closingNotes && closingNotes.trim()
                ? `Closed by Command: ${closingNotes.trim()}`
                : "Verified and closed by Command Operations.",
            createdAt: now,
        });
        return {
            citizenUid: inc.createdBy || null,
            assignedResponderId: inc.assignedResponderId || null,
        };
    });

    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.incidents.update(incidentId, {
                status: "Closed",
                syncStatus: "SYNCED",
                updatedAt: new Date().toISOString(),
            });
        } catch {
            // ignore
        }
    }

    if (txMeta.citizenUid && txMeta.citizenUid !== coordinatorUid) {
        void createNotificationIdempotent({
            recipientUid: txMeta.citizenUid,
            eventType: NOTIFICATION_EVENTS.INCIDENT_CLOSED,
            title: `Incident ${incidentId} closed`,
            message: `Command Operations has verified and closed incident ${incidentId}.`,
            incidentId,
            priority: "NORMAL",
            sourceActorUid: coordinatorUid,
            dedupKey: `INCIDENT_CLOSED:${incidentId}`,
        });
    }
    if (txMeta.assignedResponderId && txMeta.assignedResponderId !== coordinatorUid) {
        void createNotificationIdempotent({
            recipientUid: txMeta.assignedResponderId,
            eventType: NOTIFICATION_EVENTS.INCIDENT_CLOSED,
            title: `Incident ${incidentId} verified & closed`,
            message: `Command Operations verified and closed incident ${incidentId}.`,
            incidentId,
            priority: "NORMAL",
            sourceActorUid: coordinatorUid,
            dedupKey: `INCIDENT_CLOSED:${incidentId}`,
        });
    }
    void notifyCommandUsers({
        eventType: NOTIFICATION_EVENTS.INCIDENT_CLOSED,
        title: `Incident ${incidentId} closed`,
        message: `Incident ${incidentId} was verified and closed by Command Operations.`,
        incidentId,
        priority: "LOW",
        sourceActorUid: coordinatorUid,
        excludeActorUid: coordinatorUid,
        dedupKey: `INCIDENT_CLOSED:${incidentId}`,
    });
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
    let trustedCommandLevel = typeof options === "object" && options?.reviewerRole ? options.reviewerRole : "COORDINATOR";
    if (!["COORDINATOR", "ADMINISTRATOR"].includes(trustedCommandLevel)) {
        throw new Error("Authorization error: Only Command staff (COORDINATOR or ADMINISTRATOR) can approve responder applications.");
    }
    let trustedName = typeof options === "object" && options?.reviewerName ? String(options.reviewerName).trim() : null;
    try {
        const reviewerSnap = await getDoc(doc(db, "users", coordinatorUid));
        if (reviewerSnap.exists()) {
            const rData = reviewerSnap.data();
            if (rData.role !== "COMMAND" || !["COORDINATOR", "ADMINISTRATOR"].includes(rData.commandLevel)) {
                throw new Error("Authorization error: Reviewer profile does not hold Command authority.");
            }
            if (rData.accountStatus !== "ACTIVE") {
                throw new Error("Authorization error: Reviewer account is not ACTIVE.");
            }
            trustedCommandLevel = rData.commandLevel;
            trustedName = rData.displayName || rData.email || trustedName;
        }
    }
    catch (revErr) {
        if (revErr?.message?.startsWith("Authorization error:"))
            throw revErr;
    }
    const reviewerName = trustedName || "Command Officer";
    const reviewerDesignation = trustedCommandLevel === "ADMINISTRATOR"
        ? "Command Administrator"
        : "Command Operations / Coordinator";
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
        reviewerRole: "COMMAND",
        reviewerCommandLevel: trustedCommandLevel,
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
    let trustedCommandLevel = typeof options === "object" && options?.reviewerRole ? options.reviewerRole : "COORDINATOR";
    if (!["COORDINATOR", "ADMINISTRATOR"].includes(trustedCommandLevel)) {
        throw new Error("Authorization error: Only Command staff (COORDINATOR or ADMINISTRATOR) can reject responder applications.");
    }
    let trustedName = typeof options === "object" && options?.reviewerName ? String(options.reviewerName).trim() : null;
    try {
        const reviewerSnap = await getDoc(doc(db, "users", coordinatorUid));
        if (reviewerSnap.exists()) {
            const rData = reviewerSnap.data();
            if (rData.role !== "COMMAND" || !["COORDINATOR", "ADMINISTRATOR"].includes(rData.commandLevel)) {
                throw new Error("Authorization error: Reviewer profile does not hold Command authority.");
            }
            if (rData.accountStatus !== "ACTIVE") {
                throw new Error("Authorization error: Reviewer account is not ACTIVE.");
            }
            trustedCommandLevel = rData.commandLevel;
            trustedName = rData.displayName || rData.email || trustedName;
        }
    }
    catch (revErr) {
        if (revErr?.message?.startsWith("Authorization error:"))
            throw revErr;
    }
    const reviewerName = trustedName || "Command Officer";
    const reviewerDesignation = trustedCommandLevel === "ADMINISTRATOR"
        ? "Command Administrator"
        : "Command Operations / Coordinator";
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
        reviewerRole: "COMMAND",
        reviewerCommandLevel: trustedCommandLevel,
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

/**
 * Fetch recent responder application review audit records (for Command history display).
 */
export async function fetchRecentApplicationReviews() {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
        return [];
    }
    try {
        const q = query(collection(db, "responderApplicationReviews"), orderBy("reviewedAt", "desc"), limit(25));
        const snap = await getDocs(q);
        const list = [];
        snap.forEach((d) => {
            const data = d.data();
            list.push({
                ...data,
                reviewedAtIso: data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : data.reviewedAt || null,
            });
        });
        return list;
    }
    catch (err) {
        console.warn("[CommandService] Failed to fetch application review audit trail:", err);
        return [];
    }
}

/**
 * Assert that the currently authenticated user is an ACTIVE COMMAND ADMINISTRATOR.
 */
async function assertActiveAdministrator() {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
        throw new Error("Authorization error: Authenticated Administrator session is required.");
    }
    const adminSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (!adminSnap.exists()) {
        throw new Error("Authorization error: Administrator profile not found.");
    }
    const adminData = adminSnap.data();
    if (adminData.role !== "COMMAND" || adminData.commandLevel !== "ADMINISTRATOR" || adminData.accountStatus !== "ACTIVE") {
        throw new Error("Authorization error: Only active Command Administrators can provision personnel.");
    }
    return {
        uid: auth.currentUser.uid,
        name: adminData.displayName || adminData.email || "Command Administrator",
    };
}

export const VALID_OPERATIONAL_UNITS = [
    "GENERAL",
    "MEDICAL",
    "SEARCH_AND_RESCUE",
    "FIRE_HAZARD",
    "LOGISTICS",
];

/**
 * Create an Administrator-only personnel provisioning invitation in /invitations/{id}.
 * Supports provisioning Command Operations (COORDINATOR) or Responder personnel.
 * Strictly blocks creating another ADMINISTRATOR.
 * Administrator sets only identity + trusted role/classification/unit (no personal persona details).
 */
export const DEFAULT_PRODUCTION_APP_URL = "https://beacon-mesh-eta.vercel.app";

/**
 * Resolve the base URL for personnel invitation links.
 * Defaults to the production Vercel deployment and never leaks localhost into production invitations.
 */
export function resolveInvitationBaseUrl(options = {}) {
    const envUrl = (import.meta?.env?.VITE_PUBLIC_APP_URL || "").trim();
    if (envUrl) {
        try {
            const parsed = new URL(envUrl);
            if (!import.meta?.env?.PROD || (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1")) {
                return parsed.origin;
            }
        }
        catch {
            // fall through to safe default
        }
    }
    if (
        options.preferLocalOrigin &&
        !import.meta?.env?.PROD &&
        typeof window !== "undefined" &&
        window.location?.origin &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ) {
        return window.location.origin;
    }
    return DEFAULT_PRODUCTION_APP_URL;
}

/**
 * Build an encoded single-use personnel invitation registration URL.
 */
export function buildInvitationUrl(invitationId, email, options = {}) {
    const baseUrl = resolveInvitationBaseUrl(options);
    const normalizedEmail = String(email || "").trim().toLowerCase();
    return `${baseUrl}/signup?invite=${encodeURIComponent(invitationId)}&email=${encodeURIComponent(normalizedEmail)}`;
}

/**
 * Request the server-side email endpoint to send (or resend) an invitation email via Gmail SMTP.
 */
export async function sendPersonnelInvitationEmail({ invitationId, isRetry = false, isResend = false }) {
    if (!invitationId) {
        return { ok: false, status: "FAILED", error: "Invitation ID is required." };
    }
    if (!auth?.currentUser) {
        return { ok: false, status: "FAILED", error: "Administrator authentication required." };
    }
    try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch("/api/send-invitation-email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                invitationId,
                isRetry,
                isResend,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                ok: false,
                status: "FAILED",
                error: data?.error || `Email service returned HTTP ${res.status}.`,
            };
        }
        return {
            ok: true,
            status: "SENT",
            provider: data?.provider || "gmail-smtp",
            messageId: data?.messageId || null,
            inviteUrl: data?.inviteUrl || null,
        };
    }
    catch (err) {
        return {
            ok: false,
            status: "FAILED",
            error: err?.message || "Network error while contacting email service.",
        };
    }
}

export async function createPersonnelInvitation(params) {
    const admin = await assertActiveAdministrator();
    const fullName = String(params?.fullName || "").trim();
    const normalizedEmail = String(params?.email || "").trim().toLowerCase();
    const targetRole = String(params?.targetRole || "").toUpperCase();
    const targetCommandLevel = params?.targetCommandLevel ? String(params.targetCommandLevel).toUpperCase() : null;
    const targetResponderSubtype = params?.targetResponderSubtype ? String(params.targetResponderSubtype).toUpperCase() : null;
    const targetUnit = params?.targetUnit ? String(params.targetUnit).toUpperCase() : null;

    if (!fullName || fullName.length > 100) {
        throw new Error("A valid full name (1-100 characters) is required.");
    }
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error("A valid email address is required.");
    }
    if (targetCommandLevel === "ADMINISTRATOR") {
        throw new Error("Authorization error: Provisioning another Administrator is prohibited.");
    }
    if (targetRole === "COMMAND") {
        if (targetCommandLevel !== "COORDINATOR") {
            throw new Error("Command provisioning is restricted to COORDINATOR (Command Operations) only.");
        }
        if (targetUnit !== null) {
            throw new Error("Command Operations invitations cannot specify a responder operational unit.");
        }
    }
    else if (targetRole === "RESPONDER") {
        if (!["PROFESSIONAL", "VOLUNTEER"].includes(targetResponderSubtype || "")) {
            throw new Error("Responder provisioning requires PROFESSIONAL or VOLUNTEER subtype.");
        }
        if (!VALID_OPERATIONAL_UNITS.includes(targetUnit || "")) {
            throw new Error("A valid operational unit is required for Responder provisioning.");
        }
    }
    else {
        throw new Error("Invalid target role for personnel provisioning.");
    }

    const existingInviteSnap = await getDocs(query(collection(db, "invitations"), where("email", "==", normalizedEmail), where("status", "==", "PENDING"), limit(1)));
    if (!existingInviteSnap.empty) {
        throw new Error("A pending invitation already exists for this email address.");
    }
    const existingUserSnap = await getDocs(query(collection(db, "users"), where("email", "==", normalizedEmail), limit(1)));
    if (!existingUserSnap.empty) {
        throw new Error("A registered BeaconMesh account already exists for this email address.");
    }

    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
        throw new Error("Secure token generator is unavailable.");
    }
    const invitationId = cryptoApi.randomUUID();
    const auditId = `aud_prov_${invitationId}`;
    const expiresAtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteUrl = buildInvitationUrl(invitationId, normalizedEmail);

    const record = {
        id: invitationId,
        email: normalizedEmail,
        fullName,
        targetRole,
        targetCommandLevel: targetRole === "COMMAND" ? "COORDINATOR" : null,
        targetResponderSubtype: targetRole === "RESPONDER" ? targetResponderSubtype : null,
        targetUnit: targetRole === "RESPONDER" ? targetUnit : null,
        status: "PENDING",
        invitedByUid: admin.uid,
        invitedByName: admin.name,
        invitedByCommandLevel: "ADMINISTRATOR",
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtDate),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, "invitations", invitationId), record);
    batch.set(doc(db, "accountAuditLogs", auditId), {
        id: auditId,
        targetUid: invitationId,
        targetEmail: normalizedEmail,
        action: "ACCOUNT_PROVISIONED",
        actorUid: admin.uid,
        actorName: admin.name,
        actorCommandLevel: "ADMINISTRATOR",
        actorDesignation: "Command Administrator",
        reason: `Invited as ${targetRole === "COMMAND" ? "Command Operations (Coordinator)" : `${targetResponderSubtype} Responder (${targetUnit})`}`,
        createdAt: serverTimestamp(),
    });
    await batch.commit();

    return {
        ...record,
        inviteUrl,
        expiresAtIso: expiresAtDate.toISOString(),
    };
}

/**
 * Fetch and validate an invitation for an authenticated, email-verified invitee.
 */
export async function fetchInvitationForInvitee(invitationId) {
    if (!isFirebaseConfigured || !db || !auth?.currentUser || !invitationId) {
        throw new Error("Authenticated session and invitation ID are required.");
    }
    const snap = await getDoc(doc(db, "invitations", invitationId));
    if (!snap.exists()) {
        throw new Error("Invitation not found or inaccessible.");
    }
    const inv = snap.data();
    if (inv.status !== "PENDING") {
        throw new Error(`This invitation is no longer active (status: ${inv.status}).`);
    }
    const exp = inv.expiresAt?.toDate ? inv.expiresAt.toDate() : new Date(inv.expiresAt);
    if (exp && exp.getTime() < Date.now()) {
        throw new Error("This invitation has expired. Please request a new invitation from your Administrator.");
    }
    if (inv.email?.toLowerCase() !== auth.currentUser.email?.toLowerCase()) {
        throw new Error("This invitation is bound to a different email address.");
    }
    return {
        ...inv,
        expiresAtIso: exp ? exp.toISOString() : null,
    };
}

/**
 * Atomically claim an Admin-issued invitation and create the invitee's Firestore user profile.
 * Trusted authorization fields (role, commandLevel, responderSubtype, requestedUnit) come strictly
 * from the invitation; personal/persona fields come from personaParams.
 */
export async function claimInvitationAndCreateProfile(user, invitation, personaParams) {
    if (!isFirebaseConfigured || !db) {
        throw new Error("Firestore is not initialized.");
    }
    if (!user?.uid || !user?.emailVerified) {
        throw new Error("Email verification is required before claiming an invitation.");
    }
    if (!invitation?.id || invitation.status !== "PENDING") {
        throw new Error("A valid pending invitation is required.");
    }
    const userRef = doc(db, "users", user.uid);
    const existingUser = await getDoc(userRef);
    if (existingUser.exists()) {
        return existingUser.data();
    }

    const isCommandTarget = invitation.targetRole === "COMMAND";
    const now = serverTimestamp();
    const profileDoc = {
        uid: user.uid,
        displayName: String(personaParams?.fullName || invitation.fullName || user.displayName || "Personnel").trim(),
        email: (user.email || invitation.email).toLowerCase(),
        photoURL: user.photoURL || null,
        role: isCommandTarget ? "COMMAND" : "RESPONDER",
        commandLevel: isCommandTarget ? "COORDINATOR" : null,
        responderSubtype: isCommandTarget ? null : invitation.targetResponderSubtype,
        requestedRole: null,
        requestedResponderSubtype: null,
        requestedUnit: isCommandTarget ? null : invitation.targetUnit,
        capabilities: isCommandTarget ? [] : ["CITIZEN", "RESPONDER"],
        citizenEnrollmentStatus: isCommandTarget ? "INACTIVE" : "ACTIVE",
        responderApplicationStatus: isCommandTarget ? "NOT_APPLIED" : "APPROVED",
        registrationPath: isCommandTarget ? "CITIZEN" : "RESPONDER",
        approvalStatus: isCommandTarget ? "NOT_REQUIRED" : "APPROVED",
        dutyStatus: isCommandTarget ? null : "OFF_DUTY",
        activeIncidentId: null,
        phoneNumber: personaParams?.phoneNumber?.trim() || null,
        phoneVerified: false,
        emailVerified: true,
        emailVerifiedAt: now,
        accountStatus: "ACTIVE",
        region: personaParams?.region?.trim() || null,
        district: personaParams?.district?.trim() || null,
        city: personaParams?.city?.trim() || null,
        organization: personaParams?.organization?.trim() || null,
        designation: personaParams?.designation?.trim() || null,
        experienceYears: !isCommandTarget && personaParams?.experienceYears != null && personaParams.experienceYears !== ""
            ? Number(personaParams.experienceYears)
            : null,
        credentialsSummary: !isCommandTarget ? (personaParams?.credentialsSummary?.trim() || null) : null,
        invitationId: invitation.id,
        invitedByUid: invitation.invitedByUid,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
    };

    const batch = writeBatch(db);
    batch.update(doc(db, "invitations", invitation.id), {
        status: "CLAIMED",
        claimedByUid: user.uid,
        claimedAt: now,
        updatedAt: now,
    });
    batch.set(userRef, profileDoc);
    await batch.commit();
    return profileDoc;
}

/**
 * Suspend an eligible account (Citizen, Responder, or Coordinator) with mandatory reason and audit log.
 * Blocks self-suspension and Administrator suspension.
 */
export async function suspendUserAccount(targetUid, reason) {
    const admin = await assertActiveAdministrator();
    if (!targetUid) {
        throw new Error("Target user UID is required.");
    }
    if (targetUid === admin.uid) {
        throw new Error("Administrators cannot suspend their own account.");
    }
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
        throw new Error("A suspension reason is required.");
    }
    const targetSnap = await getDoc(doc(db, "users", targetUid));
    if (!targetSnap.exists()) {
        throw new Error("Target user profile not found.");
    }
    if (targetSnap.data().commandLevel === "ADMINISTRATOR") {
        throw new Error("Authorization error: Cannot suspend an Administrator account.");
    }

    const auditId = `aud_susp_${targetUid}_${Date.now()}`;
    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.update(doc(db, "users", targetUid), {
        accountStatus: "SUSPENDED",
        updatedAt: now,
    });
    batch.set(doc(db, "accountAuditLogs", auditId), {
        id: auditId,
        targetUid,
        action: "ACCOUNT_SUSPENDED",
        actorUid: admin.uid,
        actorName: admin.name,
        actorCommandLevel: "ADMINISTRATOR",
        actorDesignation: "Command Administrator",
        reason: trimmedReason,
        createdAt: now,
    });
    await batch.commit();
    return { auditId, accountStatus: "SUSPENDED" };
}

/**
 * Reactivate a suspended account (restores accountStatus to ACTIVE only) with audit log.
 */
export async function reactivateUserAccount(targetUid) {
    const admin = await assertActiveAdministrator();
    if (!targetUid) {
        throw new Error("Target user UID is required.");
    }
    if (targetUid === admin.uid) {
        throw new Error("Administrators cannot modify their own account status.");
    }
    const targetSnap = await getDoc(doc(db, "users", targetUid));
    if (!targetSnap.exists()) {
        throw new Error("Target user profile not found.");
    }
    if (targetSnap.data().commandLevel === "ADMINISTRATOR") {
        throw new Error("Authorization error: Cannot modify an Administrator account.");
    }

    const auditId = `aud_react_${targetUid}_${Date.now()}`;
    const now = serverTimestamp();
    const batch = writeBatch(db);
    batch.update(doc(db, "users", targetUid), {
        accountStatus: "ACTIVE",
        updatedAt: now,
    });
    batch.set(doc(db, "accountAuditLogs", auditId), {
        id: auditId,
        targetUid,
        action: "ACCOUNT_REACTIVATED",
        actorUid: admin.uid,
        actorName: admin.name,
        actorCommandLevel: "ADMINISTRATOR",
        actorDesignation: "Command Administrator",
        reason: "Account reactivated by Command Administrator",
        createdAt: now,
    });
    await batch.commit();
    return { auditId, accountStatus: "ACTIVE" };
}

/**
 * Fetch immutable administrative audit logs for a target user (or invitationId).
 */
export async function fetchAccountAuditHistory(targetUid, invitationId = null) {
    if (!isFirebaseConfigured || !db || !auth?.currentUser || !targetUid) {
        return [];
    }
    await assertActiveAdministrator();
    const targets = invitationId ? [targetUid, invitationId] : [targetUid];
    const snap = await getDocs(query(collection(db, "accountAuditLogs"), where("targetUid", "in", targets), limit(25)));
    const list = [];
    snap.forEach((d) => {
        const data = d.data();
        list.push({
            ...data,
            createdAtIso: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        });
    });
    list.sort((a, b) => new Date(b.createdAtIso || 0).getTime() - new Date(a.createdAtIso || 0).getTime());
    return list;
}

/**
 * Fetch a specific responder application review audit record by ID.
 */
export async function fetchReviewById(reviewId) {
    if (!isFirebaseConfigured || !db || !auth?.currentUser || !reviewId) {
        return null;
    }
    const snap = await getDoc(doc(db, "responderApplicationReviews", reviewId));
    if (!snap.exists()) {
        return null;
    }
    const data = snap.data();
    return {
        ...data,
        reviewedAtIso: data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : null,
    };
}

/**
 * Fetch personnel invitations (Administrator-only).
 */
export async function fetchPersonnelInvitations() {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
        return [];
    }
    await assertActiveAdministrator();
    const snap = await getDocs(query(collection(db, "invitations"), orderBy("createdAt", "desc"), limit(30)));
    const list = [];
    snap.forEach((d) => {
        const data = d.data();
        list.push({
            ...data,
            createdAtIso: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
            expiresAtIso: data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : null,
        });
    });
    return list;
}

/**
 * Revoke a pending personnel invitation (Administrator-only).
 */
export async function revokePersonnelInvitation(invitationId) {
    const admin = await assertActiveAdministrator();
    if (!invitationId) {
        throw new Error("Invitation ID is required.");
    }
    await updateDoc(doc(db, "invitations", invitationId), {
        status: "REVOKED",
        revokedByUid: admin.uid,
        revokedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}
