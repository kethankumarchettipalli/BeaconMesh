import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { getLocalDb } from "../db/dexie-db";

export const NOTIFICATION_EVENTS = {
    SOS_SAVED_LOCALLY: "SOS_SAVED_LOCALLY",
    SOS_SYNCED: "SOS_SYNCED",
    SOS_RECEIVED: "SOS_RECEIVED",
    INCIDENT_ACKNOWLEDGED: "INCIDENT_ACKNOWLEDGED",
    RESPONDER_ASSIGNED: "RESPONDER_ASSIGNED",
    ASSIGNMENT_OFFERED: "ASSIGNMENT_OFFERED",
    ASSIGNMENT_ACCEPTED: "ASSIGNMENT_ACCEPTED",
    ASSIGNMENT_DECLINED: "ASSIGNMENT_DECLINED",
    ASSIGNMENT_CANCELLED: "ASSIGNMENT_CANCELLED",
    ASSIGNMENT_REASSIGNED: "ASSIGNMENT_REASSIGNED",
    RESPONDER_EN_ROUTE: "RESPONDER_EN_ROUTE",
    RESPONDER_ON_SCENE: "RESPONDER_ON_SCENE",
    ASSISTANCE_STARTED: "ASSISTANCE_STARTED",
    RESOLUTION_SUBMITTED: "RESOLUTION_SUBMITTED",
    INCIDENT_CLOSED: "INCIDENT_CLOSED",
    COMMAND_STATUS_UPDATE: "COMMAND_STATUS_UPDATE",
};

const VALID_PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"];

/**
 * Build a deterministic, Firestore-safe notification document ID for idempotency.
 */
export function buildNotificationId(dedupKey, recipientUid) {
    const raw = `notif_${dedupKey}_${recipientUid}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return raw.slice(0, 160);
}

/**
 * Convert a Firestore or Dexie notification record into a normalized UI object.
 */
export function normalizeNotification(data) {
    const createdAtIso = data.createdAt && typeof data.createdAt.toDate === "function"
        ? data.createdAt.toDate().toISOString()
        : typeof data.createdAt === "string"
            ? data.createdAt
            : new Date().toISOString();
    const readAtIso = data.readAt && typeof data.readAt.toDate === "function"
        ? data.readAt.toDate().toISOString()
        : typeof data.readAt === "string"
            ? data.readAt
            : null;
    const isRead = typeof data.isRead === "boolean" ? data.isRead : Boolean(data.read);
    const id = data.notificationId || data.id;
    return {
        id,
        notificationId: id,
        recipientUid: data.recipientUid || data.recipientId || "",
        eventType: data.eventType || "COMMAND_STATUS_UPDATE",
        title: data.title || "Operational update",
        message: data.message || "",
        incidentId: data.incidentId || null,
        priority: VALID_PRIORITIES.includes(data.priority) ? data.priority : "NORMAL",
        sourceActorUid: data.sourceActorUid || null,
        dedupKey: data.dedupKey || id,
        isRead,
        read: isRead,
        readAt: readAtIso,
        createdAt: createdAtIso,
        isLocalOnly: Boolean(data.isLocalOnly),
        metadata: data.metadata || {},
    };
}

/**
 * Persist a local-only notification in Dexie (used for offline/unsynced SOS state).
 */
export async function createLocalNotification({
    recipientUid,
    eventType,
    title,
    message,
    incidentId = null,
    priority = "NORMAL",
    sourceActorUid = null,
    dedupKey,
    metadata = {},
}) {
    if (!recipientUid || !dedupKey)
        return null;
    const notificationId = buildNotificationId(dedupKey, recipientUid);
    const now = new Date().toISOString();
    const record = {
        id: notificationId,
        notificationId,
        recipientId: recipientUid,
        recipientUid,
        eventType,
        title: String(title).slice(0, 120),
        message: String(message).slice(0, 400),
        incidentId: incidentId || null,
        priority: VALID_PRIORITIES.includes(priority) ? priority : "NORMAL",
        sourceActorUid: sourceActorUid || recipientUid,
        dedupKey: String(dedupKey).slice(0, 160),
        isRead: false,
        read: false,
        readAt: null,
        createdAt: now,
        isLocalOnly: true,
        metadata,
    };
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const existing = await localDb.notifications.get(notificationId);
            if (existing) {
                return normalizeNotification(existing);
            }
            await localDb.notifications.put(record);
        }
        catch (err) {
            console.warn("[NotificationService] Local notification write failed:", err);
        }
    }
    return normalizeNotification(record);
}

/**
 * Create a durable, idempotent notification in Cloud Firestore.
 * Uses deterministic document IDs so retries/reconnects never create duplicates.
 */
export async function createNotificationIdempotent({
    recipientUid,
    eventType,
    title,
    message,
    incidentId = null,
    priority = "NORMAL",
    sourceActorUid = null,
    dedupKey,
    metadata = {},
}) {
    if (!recipientUid || !eventType || !title || !message || !dedupKey) {
        return null;
    }
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
        return null;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return null;
    }

    const notificationId = buildNotificationId(dedupKey, recipientUid);
    const notifRef = doc(db, "notifications", notificationId);

    try {
        const existing = await getDoc(notifRef);
        if (existing.exists()) {
            return normalizeNotification(existing.data());
        }
    }
    catch {
        // If getDoc fails due to non-existence or rules, proceed to setDoc
    }

    const actorUid = sourceActorUid || auth.currentUser.uid;
    const payload = {
        notificationId,
        recipientUid,
        eventType,
        title: String(title).slice(0, 120),
        message: String(message).slice(0, 400),
        incidentId: incidentId || null,
        priority: VALID_PRIORITIES.includes(priority) ? priority : "NORMAL",
        sourceActorUid: actorUid,
        dedupKey: String(dedupKey).slice(0, 160),
        isRead: false,
        readAt: null,
        createdAt: serverTimestamp(),
        metadata: metadata && typeof metadata === "object" ? metadata : {},
    };

    try {
        await setDoc(notifRef, payload);
        const localDb = getLocalDb();
        if (localDb) {
            try {
                await localDb.notifications.put({
                    ...payload,
                    id: notificationId,
                    recipientId: recipientUid,
                    read: false,
                    createdAt: new Date().toISOString(),
                    isLocalOnly: false,
                });
            }
            catch {
                // ignore cache failure
            }
        }
        return normalizeNotification({ ...payload, createdAt: new Date().toISOString() });
    }
    catch (err) {
        // Permission-denied on duplicate create (since update by non-recipient is forbidden) is safe to ignore
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("permission-denied") && !msg.includes("PERMISSION_DENIED")) {
            console.warn(`[NotificationService] Failed to create notification ${notificationId}:`, err);
        }
        return null;
    }
}

/**
 * Resolve active Command operational user UIDs (Coordinators & Administrators),
 * excluding the actor who triggered the event to prevent self-notification noise.
 */
export async function getActiveCommandRecipientUids(excludeUid = null) {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
        return [];
    }
    try {
        const q = query(
            collection(db, "users"),
            where("role", "==", "COMMAND"),
            where("accountStatus", "==", "ACTIVE"),
            limit(50)
        );
        const snap = await getDocs(q);
        const uids = [];
        snap.forEach((d) => {
            const data = d.data();
            const uid = data.uid || d.id;
            if (uid && uid !== excludeUid && ["COORDINATOR", "ADMINISTRATOR"].includes(data.commandLevel)) {
                uids.push(uid);
            }
        });
        return uids;
    }
    catch {
        // Citizens or restricted roles cannot query Command users; return empty safely
        return [];
    }
}

/**
 * Notify all eligible Command operational users for an incident lifecycle event.
 */
export async function notifyCommandUsers({
    eventType,
    title,
    message,
    incidentId,
    priority = "HIGH",
    sourceActorUid = null,
    excludeActorUid = null,
    dedupKey,
    metadata = {},
}) {
    const commandUids = await getActiveCommandRecipientUids(excludeActorUid);
    if (commandUids.length === 0)
        return [];
    const results = await Promise.all(
        commandUids.map((uid) => createNotificationIdempotent({
            recipientUid: uid,
            eventType,
            title,
            message,
            incidentId,
            priority,
            sourceActorUid,
            dedupKey,
            metadata,
        }))
    );
    return results.filter(Boolean);
}

/**
 * Ensure the active Command user has SOS_RECEIVED notifications for newly synced incidents.
 * Idempotent via deterministic notificationId (`notif_SOS_RECEIVED_${incidentId}_${commandUid}`).
 */
export async function reconcileCommandIncidentNotifications(incidents, commandUid) {
    if (!commandUid || !Array.isArray(incidents) || incidents.length === 0)
        return;
    if (!isFirebaseConfigured || !db || !auth?.currentUser)
        return;
    // Only create notifications for backend-synced incidents that are not already Closed/Cancelled
    const eligible = incidents.filter((inc) => inc.syncStatus === "SYNCED" &&
        inc.status !== "Saved on device" &&
        inc.status !== "Closed" &&
        inc.status !== "Cancelled");
    await Promise.all(
        eligible.slice(0, 20).map((inc) => {
            const cat = inc.category || inc.type || "Emergency";
            const sev = (inc.severity || inc.priority || "High").toUpperCase();
            return createNotificationIdempotent({
                recipientUid: commandUid,
                eventType: NOTIFICATION_EVENTS.SOS_RECEIVED,
                title: `New ${cat} SOS (${inc.id})`,
                message: `Incident ${inc.id} (${cat}, ${sev}) is synced and awaiting operational handling.`,
                incidentId: inc.id,
                priority: sev === "CRITICAL" ? "CRITICAL" : "HIGH",
                sourceActorUid: commandUid,
                dedupKey: `SOS_RECEIVED:${inc.id}`,
                metadata: { category: cat, severity: sev },
            });
        })
    );
}

/**
 * Subscribe to real-time notifications for the currently authenticated user.
 * Merges Firestore notifications with local-only Dexie notifications (e.g. offline SOS).
 */
export function subscribeToUserNotifications(recipientUid, onUpdate, onError) {
    if (!recipientUid) {
        onUpdate([]);
        return () => { };
    }
    let isSubscribed = true;
    let remoteNotifications = [];
    let localNotifications = [];

    const emitMerged = () => {
        if (!isSubscribed)
            return;
        const merged = new Map();
        for (const item of localNotifications) {
            if (item.recipientUid === recipientUid) {
                merged.set(item.id, item);
            }
        }
        for (const item of remoteNotifications) {
            if (item.recipientUid === recipientUid) {
                merged.set(item.id, item);
            }
        }
        const list = Array.from(merged.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        onUpdate(list);
    };

    const loadLocal = async () => {
        const localDb = getLocalDb();
        if (!localDb)
            return;
        try {
            const rows = await localDb.notifications
                .where("recipientId")
                .equals(recipientUid)
                .toArray();
            localNotifications = rows.map(normalizeNotification);
            emitMerged();
        }
        catch {
            // ignore
        }
    };

    void loadLocal();

    let unsubscribeRemote = null;
    if (isFirebaseConfigured && db && auth?.currentUser?.uid === recipientUid) {
        try {
            const q = query(
                collection(db, "notifications"),
                where("recipientUid", "==", recipientUid),
                limit(50)
            );
            unsubscribeRemote = onSnapshot(
                q,
                async (snapshot) => {
                    if (!isSubscribed)
                        return;
                    const list = [];
                    snapshot.forEach((docSnap) => {
                        list.push(normalizeNotification(docSnap.data()));
                    });
                    remoteNotifications = list;
                    const localDb = getLocalDb();
                    if (localDb && list.length > 0) {
                        try {
                            await localDb.notifications.bulkPut(
                                list.map((n) => ({
                                    ...n,
                                    recipientId: n.recipientUid,
                                    read: n.isRead,
                                }))
                            );
                        }
                        catch {
                            // ignore cache write failure
                        }
                    }
                    emitMerged();
                },
                (err) => {
                    if (onError && isSubscribed)
                        onError(err);
                    void loadLocal();
                }
            );
        }
        catch (err) {
            if (onError)
                onError(err);
        }
    }

    return () => {
        isSubscribed = false;
        if (typeof unsubscribeRemote === "function") {
            unsubscribeRemote();
        }
    };
}

/**
 * Mark a single notification as read (persists to Firestore + local Dexie).
 */
export async function markNotificationAsRead(notificationId, recipientUid) {
    if (!notificationId || !recipientUid)
        return;
    const nowIso = new Date().toISOString();
    const localDb = getLocalDb();
    let isLocalOnly = false;

    if (localDb) {
        try {
            const existing = await localDb.notifications.get(notificationId);
            isLocalOnly = Boolean(existing?.isLocalOnly);
            if (existing) {
                await localDb.notifications.update(notificationId, {
                    isRead: true,
                    read: true,
                    readAt: nowIso,
                });
            }
        }
        catch {
            // ignore
        }
    }

    if (!isLocalOnly && isFirebaseConfigured && db && auth?.currentUser?.uid === recipientUid) {
        await updateDoc(doc(db, "notifications", notificationId), {
            isRead: true,
            readAt: serverTimestamp(),
        });
    }
}

/**
 * Mark all unread notifications for the recipient as read.
 */
export async function markAllNotificationsAsRead(notifications, recipientUid) {
    if (!recipientUid || !Array.isArray(notifications))
        return;
    const unread = notifications.filter((n) => !n.isRead && n.recipientUid === recipientUid);
    if (unread.length === 0)
        return;

    const nowIso = new Date().toISOString();
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await Promise.all(
                unread.map((n) => localDb.notifications.update(n.id, {
                    isRead: true,
                    read: true,
                    readAt: nowIso,
                }))
            );
        }
        catch {
            // ignore
        }
    }

    const remoteUnread = unread.filter((n) => !n.isLocalOnly);
    if (remoteUnread.length > 0 && isFirebaseConfigured && db && auth?.currentUser?.uid === recipientUid) {
        const batch = writeBatch(db);
        for (const n of remoteUnread.slice(0, 450)) {
            batch.update(doc(db, "notifications", n.id), {
                isRead: true,
                readAt: serverTimestamp(),
            });
        }
        await batch.commit();
    }
}
