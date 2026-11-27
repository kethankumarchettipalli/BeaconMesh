import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp, } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { getLocalDb } from "../db/dexie-db";
import { enqueueOutboxItem } from "./sync-service";
import { fromFirestoreIncident } from "./incident-service";
/**
 * Get or initialize a responder profile document
 */
export async function getResponderProfile(userOrUid) {
    const uid = typeof userOrUid === "string" ? userOrUid : userOrUid.uid;
    const displayName = typeof userOrUid === "string" ? "Field Responder" : userOrUid.displayName || "Field Responder";
    const email = typeof userOrUid === "string" ? "" : userOrUid.email || "";
    const phoneNumber = typeof userOrUid === "string" ? undefined : userOrUid.phoneNumber;
    const responderSubtype = typeof userOrUid === "string" ? "VOLUNTEER" : userOrUid.responderSubtype || "VOLUNTEER";
    const localDb = getLocalDb();
    let localRecord;
    if (localDb && uid) {
        try {
            localRecord = await localDb.responderProfiles.get(uid);
        }
        catch {
            // ignore
        }
    }
    if (localRecord) {
        return {
            ...localRecord,
            isAvailable: localRecord.availabilityStatus === "AVAILABLE",
        };
    }
    // Check Firestore if online
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser && uid) {
        try {
            const snap = await getDoc(doc(db, "responderProfiles", uid));
            if (snap.exists()) {
                const data = snap.data();
                if (localDb)
                    await localDb.responderProfiles.put(data);
                return {
                    ...data,
                    isAvailable: data.availabilityStatus === "AVAILABLE",
                };
            }
        }
        catch (err) {
            console.info("[ResponderService] Offline fallback for responder profile:", err);
        }
    }
    // Construct default profile
    const defaultProfile = {
        uid: uid || "anonymous-responder",
        displayName,
        email,
        phoneNumber: phoneNumber || undefined,
        responderSubtype,
        availabilityStatus: "AVAILABLE",
        operationalStatus: "Standing by for dispatch",
        skills: ["First Aid", "Radio Mesh", "Field Search"],
        updatedAt: new Date().toISOString(),
    };
    if (localDb && uid) {
        try {
            await localDb.responderProfiles.put(defaultProfile);
        }
        catch {
            // ignore
        }
    }
    return {
        ...defaultProfile,
        isAvailable: true,
    };
}
/**
 * Update responder availability (e.g. AVAILABLE vs UNAVAILABLE vs OFF_DUTY).
 * Persists `users/{uid}.dutyStatus` to Firestore first when online (authoritative source of truth),
 * then updates local Dexie `responderProfiles` and `responderProfiles/{uid}` only after success.
 */
export async function setResponderAvailability(uid, availability, operationalStatus) {
    const availabilityStatus = typeof availability === "boolean"
        ? availability
            ? "AVAILABLE"
            : "UNAVAILABLE"
        : availability;
    if (!["AVAILABLE", "UNAVAILABLE", "OFF_DUTY"].includes(availabilityStatus)) {
        throw new Error(`Invalid availability status "${availabilityStatus}".`);
    }
    const now = new Date().toISOString();
    const updates = {
        availabilityStatus,
        updatedAt: now,
    };
    if (operationalStatus)
        updates.operationalStatus = operationalStatus;

    const isOnline = typeof navigator !== "undefined" && navigator.onLine;
    if (isFirebaseConfigured && db && isOnline && auth?.currentUser) {
        await updateDoc(doc(db, "users", uid), {
            dutyStatus: availabilityStatus,
            updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, "responderProfiles", uid), {
            uid,
            availabilityStatus,
            ...(operationalStatus ? { operationalStatus } : {}),
            updatedAt: serverTimestamp(),
        }, { merge: true });
    }
    else {
        await enqueueOutboxItem("UPDATE_RESPONDER_AVAILABILITY", "responderProfiles", uid, updates);
    }

    const localDb = getLocalDb();
    if (localDb) {
        try {
            const existing = await localDb.responderProfiles.get(uid);
            if (existing) {
                await localDb.responderProfiles.update(uid, updates);
            }
            else {
                await localDb.responderProfiles.put({ uid, ...updates });
            }
        }
        catch {
            // ignore local cache error after authoritative write
        }
    }
    return availabilityStatus;
}
/**
 * Get assigned incidents for a given responder UID
 */
export async function getAssignedIncidents(responderId) {
    const localDb = getLocalDb();
    let allIncidents = [];
    if (localDb) {
        try {
            allIncidents = await localDb.incidents.toArray();
        }
        catch {
            // ignore
        }
    }
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            const q = query(collection(db, "incidents"), where("assignedResponderId", "==", responderId));
            const snap = await getDocs(q);
            const remoteList = [];
            snap.forEach((d) => remoteList.push(fromFirestoreIncident(d.data())));
            if (localDb && remoteList.length > 0) {
                await localDb.incidents.bulkPut(remoteList);
            }
            return remoteList;
        }
        catch (err) {
            console.info("[ResponderService] Reading assigned incidents locally:", err);
        }
    }
    return allIncidents.filter((inc) => inc.assignedResponderIds?.includes(responderId) || inc.assignedResponderId === responderId);
}
/**
 * Update isolated telemetry document in `responderLocations/{uid}`.
 * Only valid if user's accountStatus is ACTIVE and coordinates are in range.
 */
export async function updateResponderLocation(uid, params) {
    if (params.latitude < -90 || params.latitude > 90) {
        throw new Error("Latitude must be between -90 and 90 degrees");
    }
    if (params.longitude < -180 || params.longitude > 180) {
        throw new Error("Longitude must be between -180 and 180 degrees");
    }
    const payload = {
        uid,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracyMeters: params.accuracyMeters,
        heading: params.heading,
        speed: params.speed,
        dutyStatus: params.dutyStatus,
        activeIncidentId: params.activeIncidentId ?? null,
        updatedAt: new Date().toISOString(),
        source: params.source || "GPS",
    };
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            await setDoc(doc(db, "responderLocations", uid), {
                ...payload,
                updatedAt: serverTimestamp(),
            });
        }
        catch (err) {
            console.warn("[ResponderService] Remote location update failed:", err);
        }
    }
}
/**
 * Delete isolated telemetry document when a responder goes OFF_DUTY.
 * Enforces Safeguard 2 (Responder removing their own location record, ensuring privacy).
 */
export async function deleteResponderLocation(uid) {
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            await deleteDoc(doc(db, "responderLocations", uid));
        }
        catch (err) {
            console.warn("[ResponderService] Remote location deletion failed:", err);
        }
    }
}
/**
 * Transition responder duty status with active assignment integrity protection (Safeguard 3).
 * A responder cannot unilaterally go OFF_DUTY or AVAILABLE while an incident is actively assigned.
 */
export async function updateResponderDutyStatus(uid, nextStatus, currentActiveIncidentId) {
    if (currentActiveIncidentId && (nextStatus === "OFF_DUTY" || nextStatus === "AVAILABLE")) {
        throw new Error(`Cannot transition duty status to '${nextStatus}' while actively assigned to incident ${currentActiveIncidentId}. Incident must be completed or reassigned first.`);
    }
    // If going off-duty, securely remove live location telemetry
    if (nextStatus === "OFF_DUTY") {
        await deleteResponderLocation(uid);
    }
    const now = new Date().toISOString();
    if (isFirebaseConfigured && db && typeof navigator !== "undefined" && navigator.onLine && auth?.currentUser) {
        try {
            await updateDoc(doc(db, "users", uid), {
                dutyStatus: nextStatus,
                updatedAt: serverTimestamp(),
            });
            await updateDoc(doc(db, "responderProfiles", uid), {
                dutyStatus: nextStatus,
                availabilityStatus: nextStatus === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
                updatedAt: now,
            }).catch(() => { });
        }
        catch (err) {
            console.warn("[ResponderService] Failed to update duty status remotely:", err);
        }
    }
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.responderProfiles.update(uid, {
                dutyStatus: nextStatus,
                availabilityStatus: nextStatus === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
                updatedAt: now,
            });
        }
        catch { }
    }
}
