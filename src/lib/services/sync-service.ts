import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { getLocalDb } from "../db/dexie-db";
import type { OutboxItem, IncidentRecord, SyncStatus } from "../types/data-models";

let isSyncing = false;
let listenersInitialized = false;

/**
 * Enqueue a mutation into the local IndexedDB Outbox
 */
export async function enqueueOutboxItem(
  actionType: OutboxItem["actionType"],
  collection: string,
  docId: string,
  payload: Record<string, unknown>,
): Promise<OutboxItem> {
  const localDb = getLocalDb();
  const item: OutboxItem = {
    id: `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    actionType,
    collection,
    docId,
    payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  if (localDb) {
    try {
      await localDb.outbox.put(item);
    } catch (err) {
      console.warn("[SyncService] Failed to queue item to local outbox:", err);
    }
  }

  // Attempt immediate flush if currently online
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void flushOutbox();
  }

  return item;
}

/**
 * Flush all queued outbox items to Cloud Firestore with strict Firestore rules parity
 */
export async function flushOutbox(): Promise<{ processed: number; failed: number }> {
  if (isSyncing) return { processed: 0, failed: 0 };
  const localDb = getLocalDb();
  if (!localDb) return { processed: 0, failed: 0 };

  if (!isFirebaseConfigured || !db) {
    // Running in offline/preview mode without cloud credentials
    return { processed: 0, failed: 0 };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    // Explicitly offline
    return { processed: 0, failed: 0 };
  }

  isSyncing = true;
  let processed = 0;
  let failed = 0;

  try {
    const queue = await localDb.outbox.orderBy("createdAt").toArray();

    for (const item of queue) {
      try {
        const docRef = doc(db, item.collection, item.docId);
        let commitPayload: Record<string, unknown> = { ...item.payload };

        if (item.actionType === "CREATE_INCIDENT") {
          const currentUid = auth?.currentUser?.uid;
          const createdBy = (commitPayload.createdBy as string) || (commitPayload.reporterId as string) || currentUid;

          if (!currentUid) {
            // Cannot sync to Firestore without authentication (required by security rules)
            continue;
          }

          // Strict whitelist matching firestore.rules isValidIncident()
          commitPayload = {
            id: item.docId,
            type: String(commitPayload.type || commitPayload.category || "Medical"),
            place: String(commitPayload.place || (commitPayload.location as any)?.addressLabel || "Vijayawada, NTR District, Andhra Pradesh"),
            description: commitPayload.description ? String(commitPayload.description) : null,
            status: "Waiting for connection",
            priority: String(commitPayload.priority || commitPayload.severity || "High"),
            createdBy: currentUid,
            creatorName: commitPayload.creatorName ? String(commitPayload.creatorName) : (commitPayload.reporterNameSnapshot ? String(commitPayload.reporterNameSnapshot) : (auth.currentUser.displayName || null)),
            creatorPhone: commitPayload.creatorPhone ? String(commitPayload.creatorPhone) : (commitPayload.reporterContact ? String(commitPayload.reporterContact) : null),
            assignedResponderId: commitPayload.assignedResponderId ? String(commitPayload.assignedResponderId) : (Array.isArray(commitPayload.assignedResponderIds) && commitPayload.assignedResponderIds.length > 0 ? String(commitPayload.assignedResponderIds[0]) : null),
            notes: commitPayload.notes ? String(commitPayload.notes) : null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
        } else if (item.actionType === "UPDATE_INCIDENT_STATUS" || item.actionType === "ASSIGN_INCIDENT") {
          const updates: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
          };
          if (commitPayload.status) updates.status = String(commitPayload.status);
          if (commitPayload.notes !== undefined) updates.notes = commitPayload.notes ? String(commitPayload.notes) : null;
          if (commitPayload.assignedResponderId !== undefined) {
            updates.assignedResponderId = commitPayload.assignedResponderId ? String(commitPayload.assignedResponderId) : null;
          }
          commitPayload = updates;
        } else if (item.actionType === "CREATE_SAFE_ZONE" || item.actionType === "UPDATE_SAFE_ZONE") {
          commitPayload = {
            ...commitPayload,
            updatedAt: serverTimestamp(),
          };
        } else if (item.actionType === "UPDATE_RESPONDER_AVAILABILITY") {
          commitPayload = {
            ...commitPayload,
            updatedAt: serverTimestamp(),
          };
        }

        // Commit to Firestore with merge (idempotent, prevents duplicate documents)
        await setDoc(docRef, commitPayload, { merge: true });

        // Update corresponding local records if needed
        if (item.actionType === "CREATE_INCIDENT") {
          const localInc = await localDb.incidents.get(item.docId);
          if (localInc) {
            await localDb.incidents.update(item.docId, {
              syncStatus: "SYNCED" as SyncStatus,
              status: "Waiting for connection",
              updatedAt: new Date().toISOString(),
            });
          }
        } else if (item.actionType === "UPDATE_INCIDENT_STATUS" || item.actionType === "ASSIGN_INCIDENT") {
          const localInc = await localDb.incidents.get(item.docId);
          if (localInc) {
            const updates: Partial<IncidentRecord> = {
              syncStatus: "SYNCED" as SyncStatus,
              updatedAt: new Date().toISOString(),
            };
            if (commitPayload.status) updates.status = commitPayload.status as any;
            if (commitPayload.assignedResponderId !== undefined) {
              updates.assignedResponderIds = commitPayload.assignedResponderId ? [String(commitPayload.assignedResponderId)] : [];
            }
            await localDb.incidents.update(item.docId, updates);
          }
        }

        // Remove from outbox upon successful cloud commit
        await localDb.outbox.delete(item.id);
        processed++;
      } catch (err) {
        failed++;
        console.warn(`[SyncService] Failed to sync outbox item ${item.id}:`, err);
        const errMsg = err instanceof Error ? err.message : String(err);
        await localDb.outbox.update(item.id, {
          attempts: item.attempts + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: errMsg,
        });

        // Mark local incident as SYNC_FAILED so UI informs the user honestly
        if (item.actionType === "CREATE_INCIDENT") {
          const localInc = await localDb.incidents.get(item.docId);
          if (localInc && localInc.syncStatus !== "SYNCED") {
            await localDb.incidents.update(item.docId, {
              syncStatus: "SYNC_FAILED" as SyncStatus,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        // If network offline error, halt batch until connection stabilizes
        if (errMsg.includes("offline") || errMsg.includes("unavailable") || errMsg.includes("network")) {
          break;
        }
      }
    }
  } catch (err) {
    console.warn("[SyncService] Unexpected error processing outbox queue:", err);
  } finally {
    isSyncing = false;
  }

  return { processed, failed };
}

/**
 * Get the count of pending outbox items waiting for cloud sync
 */
export async function getPendingOutboxCount(): Promise<number> {
  const localDb = getLocalDb();
  if (!localDb) return 0;
  try {
    return await localDb.outbox.count();
  } catch {
    return 0;
  }
}

/**
 * Initialize automatic background sync triggers (online event, focus)
 */
export function initAutoSync(): () => void {
  if (typeof window === "undefined") return () => {};
  if (listenersInitialized) return () => {};
  listenersInitialized = true;

  const handleOnline = () => {
    console.info("[SyncService] Network reconnected. Flushing offline outbox...");
    void flushOutbox();
  };

  const handleFocus = () => {
    void flushOutbox();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("focus", handleFocus);

  // Initial flush on load
  void flushOutbox();

  return () => {
    listenersInitialized = false;
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("focus", handleFocus);
  };
}
