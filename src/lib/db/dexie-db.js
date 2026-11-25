import Dexie from "dexie";
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
    incidents;
    outbox;
    safeZones;
    messages;
    notifications;
    responderProfiles;
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
let dbInstance = null;
export function getLocalDb() {
    if (typeof window === "undefined") {
        return null;
    }
    if (!dbInstance) {
        dbInstance = new BeaconMeshDatabase();
    }
    return dbInstance;
}
