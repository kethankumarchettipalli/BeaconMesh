import { collection, doc, getDocs, query, where, orderBy, limit, setDoc, updateDoc, onSnapshot, serverTimestamp, } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { getLocalDb } from "../db/dexie-db";
import { enqueueOutboxItem } from "./sync-service";
import { validateIncidentPayload, } from "../types/data-models";
import {
    NOTIFICATION_EVENTS,
    createLocalNotification,
    createNotificationIdempotent,
    notifyCommandUsers,
    reconcileCommandIncidentNotifications,
} from "./notification-service";
const INCIDENT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate a collision-resistant human-readable ID
 * format: BM-YYMM-XXXXXX (32^6 = 1,073,741,824 combinations per month)
 */
export function generateIncidentId() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    let suffix = "";
    if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(6);
        globalThis.crypto.getRandomValues(bytes);
        for (let i = 0; i < 6; i++) {
            suffix += INCIDENT_ID_ALPHABET[bytes[i] % INCIDENT_ID_ALPHABET.length];
        }
    }
    else {
        for (let i = 0; i < 6; i++) {
            suffix += INCIDENT_ID_ALPHABET[Math.floor(Math.random() * INCIDENT_ID_ALPHABET.length)];
        }
    }
    return `BM-${year}${month}-${suffix}`;
}
/**
 * Convert a Firestore document to canonical IncidentRecord
 */
export function fromFirestoreIncident(data) {
    const createdAtIso = data.createdAt && typeof data.createdAt.toDate === "function"
        ? data.createdAt.toDate().toISOString()
        : typeof data.createdAt === "string"
            ? data.createdAt
            : new Date().toISOString();
    const updatedAtIso = data.updatedAt && typeof data.updatedAt.toDate === "function"
        ? data.updatedAt.toDate().toISOString()
        : typeof data.updatedAt === "string"
            ? data.updatedAt
            : createdAtIso;
    const placeStr = data.place || "Vijayawada, NTR District, Andhra Pradesh";
    let latitude = 16.5062;
    let longitude = 80.648;
    // Extract coordinates from place string if format is "GPS (lat, lng)"
    const gpsMatch = placeStr.match(/\(([-+]?\d+\.?\d*),\s*([-+]?\d+\.?\d*)\)/);
    if (gpsMatch) {
        latitude = parseFloat(gpsMatch[1]);
        longitude = parseFloat(gpsMatch[2]);
    }
    const assignedResponderId = data.assignedResponderId || null;
    return {
        id: data.id || "BM-UNKNOWN",
        reporterId: data.createdBy || data.reporterId || "anonymous",
        createdBy: data.createdBy || undefined,
        reporterNameSnapshot: data.creatorName || undefined,
        reporterContact: data.creatorPhone || undefined,
        category: (data.type || data.category || "Other"),
        type: data.type || undefined,
        title: `${data.type || data.category || "Emergency"} Incident`,
        description: data.description || "",
        severity: (data.priority || data.severity || "High"),
        priority: data.priority || undefined,
        status: (data.status || "Waiting for connection"),
        location: {
            latitude,
            longitude,
            source: gpsMatch ? "GPS" : "MANUAL",
            addressLabel: placeStr,
            city: "Vijayawada",
            district: "NTR District",
            state: "Andhra Pradesh",
            country: "India",
        },
        place: placeStr,
        assignedResponderIds: assignedResponderId ? [assignedResponderId] : [],
        assignedResponderId,
        notes: data.notes || null,
        source: "CITIZEN_APP",
        syncStatus: "SYNCED",
        syncError: data.syncError || null,
        createdAt: createdAtIso,
        updatedAt: updatedAtIso,
    };
}
/**
 * Create a new emergency SOS report (Offline-First)
 */
export async function createEmergencyReport(input) {
    const reporterId = input.reporterId || auth?.currentUser?.uid || "anon-citizen";
    const severity = input.severity ||
        (input.category === "Medical" || input.category === "Trapped" ? "Critical" : "High");
    const hasCoords = typeof input.location?.latitude === "number" &&
        typeof input.location?.longitude === "number";
    const location = {
        latitude: hasCoords ? input.location.latitude : null,
        longitude: hasCoords ? input.location.longitude : null,
        accuracyMeters: hasCoords ? (input.location?.accuracyMeters ?? 15) : undefined,
        source: input.location?.source ?? (hasCoords ? "GPS" : "UNAVAILABLE"),
        addressLabel: input.location?.addressLabel ||
            (hasCoords
                ? `Location (${input.location.latitude.toFixed(4)}, ${input.location.longitude.toFixed(4)})`
                : "Location Coordinates Unavailable"),
        city: input.location?.city,
        district: input.location?.district,
        state: input.location?.state,
        country: input.location?.country || "India",
    };
    const validation = validateIncidentPayload({
        reporterId,
        category: input.category,
        description: input.description,
        severity,
        location,
    });
    if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
    }
    const id = generateIncidentId();
    const now = new Date().toISOString();
    const isOnline = typeof navigator !== "undefined" && navigator.onLine;
    const initialSyncStatus = isOnline && auth?.currentUser ? "PENDING_SYNC" : "LOCAL_ONLY";
    const record = {
        id,
        reporterId,
        createdBy: reporterId,
        reporterNameSnapshot: input.reporterNameSnapshot || auth?.currentUser?.displayName || "Anonymous Citizen",
        reporterContact: input.reporterContact || auth?.currentUser?.phoneNumber || undefined,
        category: input.category,
        type: input.category,
        title: `${input.category} Emergency`,
        description: input.description.trim(),
        severity,
        priority: severity,
        status: "Saved on device",
        location,
        place: location.addressLabel,
        assignedResponderIds: [],
        assignedResponderId: null,
        source: "CITIZEN_APP",
        syncStatus: initialSyncStatus,
        createdAt: now,
        updatedAt: now,
    };
    // 1. Persist to local IndexedDB first (guarantees offline availability)
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.incidents.put(record);
        }
        catch (err) {
            console.warn("[IncidentService] Local IndexedDB write failed:", err);
        }
    }
    if (reporterId && reporterId !== "anon-citizen") {
        void createLocalNotification({
            recipientUid: reporterId,
            eventType: NOTIFICATION_EVENTS.SOS_SAVED_LOCALLY,
            title: `SOS ${id} saved on device`,
            message: isOnline && auth?.currentUser
                ? `Report ${id} is saved locally and queued for sync. Command has not confirmed receipt yet.`
                : `Report ${id} is saved locally offline. Command has NOT received it yet; it will sync when connected.`,
            incidentId: id,
            priority: severity === "Critical" ? "CRITICAL" : "HIGH",
            sourceActorUid: reporterId,
            dedupKey: `SOS_SAVED_LOCALLY:${id}`,
            metadata: { category: record.category, syncStatus: initialSyncStatus },
        });
    }
    // 2. Queue into Offline Outbox if authenticated or queue for later sync
    if (auth?.currentUser) {
        await enqueueOutboxItem("CREATE_INCIDENT", "incidents", id, {
            id,
            type: record.category,
            place: record.place,
            description: record.description,
            status: "Waiting for connection",
            priority: record.severity,
            createdBy: auth.currentUser.uid,
            creatorName: record.reporterNameSnapshot,
            creatorPhone: record.reporterContact,
            assignedResponderId: null,
            notes: null,
        });
    }
    return record;
}
/**
 * Real-time incident subscription for Command, Responder, and Citizen dashboards
 * Uses Firestore onSnapshot with automatic local IndexedDB merging and teardown.
 */
export function subscribeToIncidents(options) {
    const { role, userId, includeCitizenOwned = false, onUpdate, onError } = options;
    let isSubscribed = true;
    const unsubscribes = [];
    const remoteBuckets = {
        primary: [],
        citizenOwned: [],
    };
    const emitCombined = async () => {
        if (!isSubscribed)
            return;
        const mergedMap = new Map();
        for (const item of [...remoteBuckets.primary, ...remoteBuckets.citizenOwned]) {
            mergedMap.set(item.id, item);
        }
        const remoteList = Array.from(mergedMap.values());
        const localDb = getLocalDb();
        if (localDb && remoteList.length > 0) {
            try {
                await localDb.incidents.bulkPut(remoteList);
            }
            catch {
                // ignore
            }
        }
        let localList = [];
        if (localDb) {
            try {
                localList = await localDb.incidents.toArray();
            }
            catch {
                localList = [];
            }
        }
        const remoteIds = new Set(remoteList.map((r) => r.id));
        const unsyncedLocals = localList.filter((l) => !remoteIds.has(l.id));
        let combined = [...unsyncedLocals, ...remoteList];
        if (role === "CITIZEN" && userId) {
            combined = combined.filter((i) => i.reporterId === userId || i.createdBy === userId);
        }
        else if (role === "RESPONDER" && userId) {
            combined = combined.filter((i) =>
                i.assignedResponderId === userId ||
                i.assignedResponderIds?.includes(userId) ||
                (includeCitizenOwned && (i.reporterId === userId || i.createdBy === userId))
            );
        }
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        onUpdate(combined);
    };
    // Immediate load from local IndexedDB for zero latency
    const loadLocal = async () => {
        const localDb = getLocalDb();
        if (!localDb)
            return;
        try {
            let list = [];
            if (role === "CITIZEN" && userId) {
                list = await localDb.incidents.where("reporterId").equals(userId).reverse().sortBy("createdAt");
            }
            else if (role === "RESPONDER" && userId) {
                const allLocal = await localDb.incidents.toArray();
                list = allLocal.filter((i) =>
                    i.assignedResponderId === userId ||
                    i.assignedResponderIds?.includes(userId) ||
                    (includeCitizenOwned && (i.reporterId === userId || i.createdBy === userId))
                );
                list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            }
            else if (role === "COMMAND" || role === "COORDINATOR" || role === "ADMINISTRATOR") {
                list = await localDb.incidents.toArray();
                list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            }
            if (isSubscribed && list.length > 0) {
                onUpdate(list);
            }
        }
        catch {
            // ignore
        }
    };
    void loadLocal();
    // If online and authenticated, subscribe to Firestore real-time updates
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            let q;
            if (role === "CITIZEN" && userId) {
                q = query(collection(db, "incidents"), where("createdBy", "==", userId), limit(50));
            }
            else if (role === "RESPONDER" && userId) {
                // Responders only receive incidents explicitly assigned to them (enforced by firestore.rules)
                q = query(collection(db, "incidents"), where("assignedResponderId", "==", userId), limit(50));
            }
            else {
                // Command coordinators and administrators receive the real-time operational incident feed
                q = query(collection(db, "incidents"), orderBy("createdAt", "desc"), limit(100));
            }
            unsubscribes.push(onSnapshot(q, async (snapshot) => {
                if (!isSubscribed)
                    return;
                const list = [];
                snapshot.forEach((docSnap) => {
                    list.push(fromFirestoreIncident(docSnap.data()));
                });
                remoteBuckets.primary = list;
                await emitCombined();
                if (userId && ["COMMAND", "COORDINATOR", "ADMINISTRATOR"].includes(role)) {
                    void reconcileCommandIncidentNotifications(list, userId);
                }
            }, (err) => {
                console.info("[IncidentService] Real-time onSnapshot notice:", err.message);
                if (onError && isSubscribed)
                    onError(err);
                void loadLocal();
            }));
            if (role === "RESPONDER" && userId && includeCitizenOwned) {
                const citizenQuery = query(collection(db, "incidents"), where("createdBy", "==", userId), limit(50));
                unsubscribes.push(onSnapshot(citizenQuery, async (snapshot) => {
                    if (!isSubscribed)
                        return;
                    const list = [];
                    snapshot.forEach((docSnap) => {
                        list.push(fromFirestoreIncident(docSnap.data()));
                    });
                    remoteBuckets.citizenOwned = list;
                    await emitCombined();
                }, () => {
                    // ignore secondary listener error if primary succeeds
                }));
            }
        }
        catch (err) {
            console.warn("[IncidentService] Failed to establish real-time listener:", err);
            if (onError)
                onError(err);
        }
    }
    // Cleanup function removing listener and preventing memory leaks
    return () => {
        isSubscribed = false;
        while (unsubscribes.length > 0) {
            const unsub = unsubscribes.pop();
            if (typeof unsub === "function")
                unsub();
        }
    };
}
/**
 * Retired legacy non-atomic assignment path.
 * Command dispatch must use `assignIncidentAtomic` in command-service.js.
 */
export async function assignIncidentToResponder(incidentId, responderId, responderName, assignedBy) {
    const { assignIncidentAtomic } = await import("./command-service");
    return assignIncidentAtomic(incidentId, responderId, assignedBy || auth?.currentUser?.uid || "command-coordinator", {
        responderName,
    });
}
/**
 * Append an immutable operational event to `incidents/{incidentId}/timeline/{eventId}`
 */
export async function appendIncidentTimelineEvent(incidentId, event) {
    if (!isFirebaseConfigured || !db || !auth?.currentUser || !incidentId)
        return null;
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
        id: eventId,
        incidentId,
        eventType: event.eventType,
        actorUid: event.actorUid || auth.currentUser.uid,
        actorRole: event.actorRole || "CITIZEN",
        details: event.details || "",
        createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, "incidents", incidentId, "timeline", eventId), payload);
    return payload;
}
/**
 * Subscribe to the append-only operational timeline for a single incident
 */
export function subscribeToIncidentTimeline(incidentId, onUpdate, onError) {
    if (!isFirebaseConfigured || !db || !auth?.currentUser || !incidentId) {
        onUpdate([]);
        return () => { };
    }
    try {
        const q = query(collection(db, "incidents", incidentId, "timeline"), orderBy("createdAt", "asc"), limit(50));
        return onSnapshot(q, (snap) => {
            const events = [];
            snap.forEach((d) => {
                const data = d.data();
                events.push({
                    ...data,
                    createdAtIso: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || null),
                });
            });
            onUpdate(events);
        }, (err) => {
            if (onError)
                onError(err);
        });
    }
    catch (err) {
        if (onError)
            onError(err);
        return () => { };
    }
}
/**
 * Update the status of an incident
 */
export async function updateIncidentStatus(incidentId, newStatus, notes, updatedBy) {
    const now = new Date().toISOString();
    const localDb = getLocalDb();
    // 1. Update local IndexedDB
    if (localDb) {
        try {
            const updates = {
                status: newStatus,
                updatedAt: now,
            };
            if (notes)
                updates.notes = notes;
            if (newStatus === "Resolved") {
                updates.resolvedAt = now;
                if (notes)
                    updates.resolutionDetails = notes;
            }
            await localDb.incidents.update(incidentId, updates);
        }
        catch (err) {
            console.warn("[IncidentService] Local status update failed:", err);
        }
    }
    // 2. Commit to Firestore if online
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            const incRef = doc(db, "incidents", incidentId);
            const cloudUpdates = {
                status: newStatus,
                updatedAt: serverTimestamp(),
            };
            if (notes)
                cloudUpdates.notes = notes;
            await updateDoc(incRef, cloudUpdates);
            if (newStatus === "Acknowledged") {
                const actorUid = updatedBy || auth.currentUser.uid;
                const incSnap = await (await import("firebase/firestore")).getDoc(incRef);
                const incData = incSnap.exists() ? incSnap.data() : null;
                if (incData?.createdBy && incData.createdBy !== actorUid) {
                    void createNotificationIdempotent({
                        recipientUid: incData.createdBy,
                        eventType: NOTIFICATION_EVENTS.INCIDENT_ACKNOWLEDGED,
                        title: `Incident ${incidentId} acknowledged`,
                        message: `Command Operations has acknowledged your ${incData.type || "SOS"} report.`,
                        incidentId,
                        priority: "HIGH",
                        sourceActorUid: actorUid,
                        dedupKey: `INCIDENT_ACKNOWLEDGED:${incidentId}`,
                        metadata: { status: "Acknowledged" },
                    });
                }
                void notifyCommandUsers({
                    eventType: NOTIFICATION_EVENTS.INCIDENT_ACKNOWLEDGED,
                    title: `Incident ${incidentId} acknowledged`,
                    message: `Incident ${incidentId} was acknowledged by Command Operations.`,
                    incidentId,
                    priority: "NORMAL",
                    sourceActorUid: actorUid,
                    excludeActorUid: actorUid,
                    dedupKey: `INCIDENT_ACKNOWLEDGED:${incidentId}`,
                    metadata: { status: "Acknowledged" },
                });
            }
            return;
        }
        catch (err) {
            console.warn("[IncidentService] Firestore status update deferred to outbox:", err);
        }
    }
    // Queue to outbox if offline or failed
    await enqueueOutboxItem("UPDATE_INCIDENT_STATUS", "incidents", incidentId, {
        status: newStatus,
        notes: notes || null,
    });
}
/**
 * Get incident reports created by a specific citizen
 */
export async function getUserIncidents(reporterId) {
    const localDb = getLocalDb();
    let localList = [];
    if (localDb) {
        try {
            localList = await localDb.incidents
                .where("reporterId")
                .equals(reporterId)
                .reverse()
                .sortBy("createdAt");
        }
        catch (err) {
            console.warn("[IncidentService] Failed to read local incidents:", err);
        }
    }
    // Fetch from Cloud Firestore if authenticated and online
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            const q = query(collection(db, "incidents"), where("createdBy", "==", reporterId), limit(50));
            const snapshot = await getDocs(q);
            const remoteList = [];
            snapshot.forEach((docSnap) => {
                remoteList.push(fromFirestoreIncident(docSnap.data()));
            });
            // Cache remote docs to IndexedDB
            if (localDb && remoteList.length > 0) {
                await localDb.incidents.bulkPut(remoteList);
            }
            // Merge remote with any un-synced local records
            const unsyncedLocals = localList.filter((l) => l.syncStatus !== "SYNCED");
            const remoteIds = new Set(remoteList.map((r) => r.id));
            const combined = [
                ...unsyncedLocals.filter((l) => !remoteIds.has(l.id)),
                ...remoteList,
            ];
            combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return combined;
        }
        catch (err) {
            console.info("[IncidentService] Remote fetch failed (using local cache):", err);
        }
    }
    return localList;
}
/**
 * Get all incidents (for Responder queue and Command dashboard)
 */
export async function getAllIncidents() {
    const localDb = getLocalDb();
    let localList = [];
    if (localDb) {
        try {
            localList = await localDb.incidents.toArray();
            localList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        catch (err) {
            console.warn("[IncidentService] Local query failed:", err);
        }
    }
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            const q = query(collection(db, "incidents"), orderBy("createdAt", "desc"), limit(100));
            const snapshot = await getDocs(q);
            const remoteList = [];
            snapshot.forEach((docSnap) => {
                remoteList.push(fromFirestoreIncident(docSnap.data()));
            });
            if (localDb && remoteList.length > 0) {
                await localDb.incidents.bulkPut(remoteList);
            }
            const remoteIds = new Set(remoteList.map((r) => r.id));
            const unsyncedLocals = localList.filter((l) => !remoteIds.has(l.id));
            const combined = [...unsyncedLocals, ...remoteList];
            combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return combined;
        }
        catch (err) {
            console.info("[IncidentService] Firestore getAllIncidents offline fallback:", err);
        }
    }
    return localList;
}
