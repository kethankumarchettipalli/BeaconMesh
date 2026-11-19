import Dexie, { type Table } from "dexie";
import type {
  IncidentRecord,
  OutboxItem,
  SafeZoneRecord,
  UserMessageRecord,
  NotificationRecord,
  ResponderProfileRecord,
} from "../types/data-models";

/**
 * BeaconMesh Dexie Database
 *
 * Provides local-first IndexedDB storage for:
 * - Incidents (cached locally, persists across offline sessions)
 * - Outbox (reliable offline synchronization queue)
 * - Safe Zones (offline maps & safety shelter cache)
 * - Messages & Notifications
 */
export class BeaconMeshDatabase extends Dexie {
  incidents!: Table<IncidentRecord, string>;
  outbox!: Table<OutboxItem, string>;
  safeZones!: Table<SafeZoneRecord, string>;
  messages!: Table<UserMessageRecord, string>;
  notifications!: Table<NotificationRecord, string>;
  responderProfiles!: Table<ResponderProfileRecord, string>;

  constructor() {
    super("BeaconMeshLocalDB");

    this.version(1).stores({
      incidents: "&id, reporterId, status, severity, category, syncStatus, createdAt",
      outbox: "&id, actionType, docId, attempts, createdAt",
      safeZones: "&id, operationalStatus, verifiedAt",
      messages: "&id, incidentId, senderId, isSimulation, createdAt",
      notifications: "&id, recipientId, read, createdAt",
      responderProfiles: "&uid, availabilityStatus",
    });
  }
}

let dbInstance: BeaconMeshDatabase | null = null;

export function getLocalDb(): BeaconMeshDatabase | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!dbInstance) {
    dbInstance = new BeaconMeshDatabase();
  }
  return dbInstance;
}
