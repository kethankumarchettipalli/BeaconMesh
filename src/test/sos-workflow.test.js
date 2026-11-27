import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIncidents,
  mockOutbox,
  mockResponderProfiles,
  mockStore,
  mockGetDoc,
  mockSetDoc,
  mockUpdateDoc,
} = vi.hoisted(() => ({
  mockIncidents: new Map(),
  mockOutbox: new Map(),
  mockResponderProfiles: new Map(),
  mockStore: new Map(),
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: true,
  db: { __mock: true },
  auth: {
    currentUser: {
      uid: "citizen-1",
      displayName: "Asha Citizen",
      phoneNumber: "+919999999999",
    },
  },
}));

vi.mock("@/lib/db/dexie-db", () => ({
  getLocalDb: () => ({
    incidents: {
      put: async (rec) => {
        mockIncidents.set(rec.id, { ...rec });
      },
      get: async (id) => mockIncidents.get(id),
      update: async (id, patch) => {
        const cur = mockIncidents.get(id);
        if (cur) mockIncidents.set(id, { ...cur, ...patch });
      },
      toArray: async () => Array.from(mockIncidents.values()),
    },
    outbox: {
      put: async (item) => {
        mockOutbox.set(item.id, { ...item });
      },
      delete: async (id) => {
        mockOutbox.delete(id);
      },
      update: async (id, patch) => {
        const cur = mockOutbox.get(id);
        if (cur) mockOutbox.set(id, { ...cur, ...patch });
      },
      orderBy: () => ({
        toArray: async () => Array.from(mockOutbox.values()),
      }),
      count: async () => mockOutbox.size,
    },
    responderProfiles: {
      get: async (id) => mockResponderProfiles.get(id),
      put: async (rec) => mockResponderProfiles.set(rec.uid, { ...rec }),
      update: async (id, patch) => {
        const cur = mockResponderProfiles.get(id);
        if (cur) mockResponderProfiles.set(id, { ...cur, ...patch });
      },
    },
  }),
}));

let txQueue = Promise.resolve();

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual("firebase/firestore");
  return {
    ...actual,
    doc: (_db, ...segments) => ({ path: segments.join("/") }),
    getDoc: (...args) => mockGetDoc(...args),
    setDoc: (...args) => mockSetDoc(...args),
    updateDoc: (...args) => mockUpdateDoc(...args),
    runTransaction: (_db, fn) => {
      const run = txQueue.then(async () => {
        const staged = [];
        const tx = {
          get: async (ref) => {
            const data = mockStore.get(ref.path);
            return { exists: () => data !== undefined, data: () => (data ? { ...data } : undefined) };
          },
          set: (ref, data) => staged.push({ op: "set", path: ref.path, data }),
          update: (ref, patch) => staged.push({ op: "update", path: ref.path, patch }),
        };
        const result = await fn(tx);
        for (const s of staged) {
          if (s.op === "set") {
            mockStore.set(s.path, { ...s.data });
          } else {
            const cur = mockStore.get(s.path) || {};
            mockStore.set(s.path, { ...cur, ...s.patch });
          }
        }
        return result;
      });
      txQueue = run.catch(() => { });
      return run;
    },
    serverTimestamp: () => "SERVER_TS",
  };
});

import { createEmergencyReport, generateIncidentId } from "@/lib/services/incident-service";
import { flushOutbox } from "@/lib/services/sync-service";
import {
  assignIncidentAtomic,
  respondToAssignmentOffer,
  updateResponderFieldProgress,
  completeIncidentAtomic,
  verifyAndCloseIncident,
} from "@/lib/services/command-service";
import { setResponderAvailability } from "@/lib/services/responder-service";

function seedTransactionalFixtures(overrides = {}) {
  mockStore.set("incidents/BM-2611-TEST01", {
    id: "BM-2611-TEST01",
    type: "Medical",
    place: "Benz Circle",
    status: "Waiting for connection",
    priority: "Critical",
    createdBy: "citizen-1",
    assignedResponderId: null,
    ...overrides.incident,
  });
  mockStore.set("users/resp-1", {
    uid: "resp-1",
    displayName: "Dr. Ravi",
    role: "RESPONDER",
    responderSubtype: "PROFESSIONAL",
    approvalStatus: "APPROVED",
    accountStatus: "ACTIVE",
    dutyStatus: "AVAILABLE",
    activeIncidentId: null,
    ...overrides.responder1,
  });
  mockStore.set("users/resp-2", {
    uid: "resp-2",
    displayName: "Nurse Meera",
    role: "RESPONDER",
    responderSubtype: "PROFESSIONAL",
    approvalStatus: "APPROVED",
    accountStatus: "ACTIVE",
    dutyStatus: "AVAILABLE",
    activeIncidentId: null,
    ...overrides.responder2,
  });
}

function getTimelineEvents(incId = "BM-2611-TEST01") {
  return Array.from(mockStore.entries())
    .filter(([k]) => k.startsWith(`incidents/${incId}/timeline/`))
    .map(([, v]) => v);
}

describe("BeaconMesh SOS Workflow, State Machine & Race-Condition Tests", () => {
  beforeEach(() => {
    mockIncidents.clear();
    mockOutbox.clear();
    mockResponderProfiles.clear();
    mockStore.clear();
    vi.clearAllMocks();
    Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
  });

  it("validates invalid SOS inputs and rejects short descriptions or invalid GPS", async () => {
    await expect(
      createEmergencyReport({
        category: "Medical",
        description: "hi",
        location: { source: "UNAVAILABLE", addressLabel: "Unavailable" },
      })
    ).rejects.toThrow(/Description must be at least 5 characters/i);

    await expect(
      createEmergencyReport({
        category: "Medical",
        description: "Need ambulance immediately",
        location: { source: "GPS", latitude: 999, longitude: 80.6 },
      })
    ).rejects.toThrow(/Invalid latitude/i);
  });

  it("generates collision-resistant BM-YYMM-XXXXXX IDs with zero duplicates across 500 calls", () => {
    const ids = new Set();
    for (let i = 0; i < 500; i++) {
      const id = generateIncidentId();
      expect(id).toMatch(/^BM-\d{4}-[A-HJ-NP-Z2-9]{6}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(500);
  });

  it("creates offline SOS in Dexie, queues outbox, and reconciles idempotently on reconnect", async () => {
    const rec = await createEmergencyReport({
      category: "Flood",
      description: "Water rising near Krishna canal",
      location: { source: "MANUAL", latitude: null, longitude: null, addressLabel: "Near Benz Circle" },
    });

    expect(rec.status).toBe("Saved on device");
    expect(rec.syncStatus).toBe("LOCAL_ONLY");
    expect(mockOutbox.size).toBe(1);

    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    mockSetDoc.mockResolvedValueOnce(undefined);

    const res = await flushOutbox();
    expect(res.processed).toBe(1);
    expect(res.failed).toBe(0);
    expect(mockOutbox.size).toBe(0);
    expect(mockIncidents.get(rec.id).syncStatus).toBe("SYNCED");
    expect(mockIncidents.get(rec.id).status).toBe("Waiting for connection");
  });

  it("does not overwrite newer server status during idempotent CREATE_INCIDENT retry", async () => {
    await createEmergencyReport({
      category: "Fire",
      description: "Transformer fire on MG Road",
      location: { source: "UNAVAILABLE", addressLabel: "Coordinates Unavailable" },
    });

    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: "In progress", assignedResponderId: "resp-99" }),
    });

    const res = await flushOutbox();
    expect(res.processed).toBe(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
    const [stored] = Array.from(mockIncidents.values());
    expect(stored.status).toBe("In progress");
    expect(stored.assignedResponderId).toBe("resp-99");
    expect(stored.syncStatus).toBe("SYNCED");
  });

  it("marks local incident SYNC_FAILED with syncError when Firestore commit fails and recovers on retry", async () => {
    const rec = await createEmergencyReport({
      category: "Accident",
      description: "Two-wheeler collision near IGMC",
      location: { source: "UNAVAILABLE", addressLabel: "Coordinates Unavailable" },
    });

    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    mockSetDoc.mockRejectedValueOnce(new Error("permission-denied"));

    const failRes = await flushOutbox();
    expect(failRes.failed).toBe(1);
    expect(mockOutbox.size).toBe(1);
    expect(mockIncidents.get(rec.id).syncStatus).toBe("SYNC_FAILED");
    expect(mockIncidents.get(rec.id).syncError).toContain("permission-denied");

    // Retry succeeds without duplicating incident
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    mockSetDoc.mockResolvedValueOnce(undefined);
    const retryRes = await flushOutbox();
    expect(retryRes.processed).toBe(1);
    expect(mockOutbox.size).toBe(0);
    expect(mockIncidents.get(rec.id).syncStatus).toBe("SYNCED");
    expect(mockIncidents.get(rec.id).syncError).toBeNull();
  });

  it("enforces full responder state machine: rejects skips, wrong responder, unaccepted OFFERED, and duplicate completion", async () => {
    seedTransactionalFixtures();
    await assignIncidentAtomic("BM-2611-TEST01", "resp-1", "coord-1");

    // Unaccepted OFFERED cannot progress or resolve
    await expect(updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "En route")).rejects.toThrow(/Accept the dispatch/i);
    await expect(updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "Resolved")).rejects.toThrow(/Accept the dispatch/i);

    await respondToAssignmentOffer("BM-2611-TEST01", "resp-1", "ACCEPTED");

    // Cannot skip from Acknowledged -> On scene or Resolved
    await expect(updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "On scene")).rejects.toThrow(/Cannot skip/i);
    await expect(updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "Resolved")).rejects.toThrow(/Complete "In progress" first/i);

    // Valid En route
    await updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "En route");
    expect(mockStore.get("incidents/BM-2611-TEST01").status).toBe("En route");
    await expect(updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "Resolved")).rejects.toThrow(/Complete "In progress" first/i);

    // Valid On scene -> cannot skip to Resolved
    await updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "On scene");
    await expect(updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "Resolved")).rejects.toThrow(/Complete "In progress" first/i);

    // Wrong responder rejected
    await expect(updateResponderFieldProgress("BM-2611-TEST01", "resp-2", "In progress")).rejects.toThrow(/not assigned|not found/i);

    // Valid In progress -> Resolved
    await updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "In progress");
    await updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "Resolved", "Patient stabilized");

    expect(mockStore.get("incidents/BM-2611-TEST01").status).toBe("Resolved");
    expect(mockStore.get("incidentAssignments/BM-2611-TEST01_resp-1").status).toBe("COMPLETED");
    expect(mockStore.get("users/resp-1").dutyStatus).toBe("AVAILABLE");
    expect(mockStore.get("users/resp-1").activeIncidentId).toBeNull();

    const eventsBeforeDup = getTimelineEvents().length;
    // Duplicate completion rejected cleanly without duplicate timeline events
    await expect(completeIncidentAtomic("BM-2611-TEST01", "resp-1")).rejects.toThrow(/already Resolved|no longer active/i);
    expect(getTimelineEvents().length).toBe(eventsBeforeDup);
  });

  it("handles concurrent dispatch, concurrent completion, and concurrent closure safely", async () => {
    seedTransactionalFixtures();

    // Concurrent dispatch: resp-1 vs resp-2 -> only 1 succeeds
    const dispatchResults = await Promise.allSettled([
      assignIncidentAtomic("BM-2611-TEST01", "resp-1", "coord-1"),
      assignIncidentAtomic("BM-2611-TEST01", "resp-2", "coord-1"),
    ]);
    const dispatchFulfilled = dispatchResults.filter((r) => r.status === "fulfilled");
    const dispatchRejected = dispatchResults.filter((r) => r.status === "rejected");
    expect(dispatchFulfilled.length).toBe(1);
    expect(dispatchRejected.length).toBe(1);

    const assignedUid = mockStore.get("incidents/BM-2611-TEST01").assignedResponderId;
    await respondToAssignmentOffer("BM-2611-TEST01", assignedUid, "ACCEPTED");
    await updateResponderFieldProgress("BM-2611-TEST01", assignedUid, "En route");
    await updateResponderFieldProgress("BM-2611-TEST01", assignedUid, "On scene");
    await updateResponderFieldProgress("BM-2611-TEST01", assignedUid, "In progress");

    // Concurrent completion: only 1 succeeds
    const completeResults = await Promise.allSettled([
      completeIncidentAtomic("BM-2611-TEST01", assignedUid, "Done 1"),
      completeIncidentAtomic("BM-2611-TEST01", assignedUid, "Done 2"),
    ]);
    expect(completeResults.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(completeResults.filter((r) => r.status === "rejected").length).toBe(1);
    expect(getTimelineEvents().filter((e) => e.eventType === "RESOLUTION_SUBMITTED").length).toBe(1);

    // Concurrent closure: only 1 succeeds
    const closeResults = await Promise.allSettled([
      verifyAndCloseIncident("BM-2611-TEST01", "coord-1", "Verified 1"),
      verifyAndCloseIncident("BM-2611-TEST01", "coord-1", "Verified 2"),
    ]);
    expect(closeResults.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(closeResults.filter((r) => r.status === "rejected").length).toBe(1);
    expect(mockStore.get("incidents/BM-2611-TEST01").status).toBe("Closed");
    expect(getTimelineEvents().filter((e) => e.eventType === "INCIDENT_CLOSED").length).toBe(1);
  });

  it("blocks verifyAndCloseIncident on unresolved incidents and preserves OFF_DUTY / UNAVAILABLE", async () => {
    seedTransactionalFixtures();
    await assignIncidentAtomic("BM-2611-TEST01", "resp-1", "coord-1");
    await respondToAssignmentOffer("BM-2611-TEST01", "resp-1", "ACCEPTED");

    // Unresolved incident cannot be closed
    await expect(verifyAndCloseIncident("BM-2611-TEST01", "coord-1")).rejects.toThrow(/must be Resolved/i);

    await updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "En route");
    await updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "On scene");
    await updateResponderFieldProgress("BM-2611-TEST01", "resp-1", "In progress");

    // Simulate responder marked UNAVAILABLE during incident
    mockStore.set("users/resp-1", { ...mockStore.get("users/resp-1"), dutyStatus: "UNAVAILABLE" });
    await completeIncidentAtomic("BM-2611-TEST01", "resp-1", "Done", "AVAILABLE");
    expect(mockStore.get("users/resp-1").dutyStatus).toBe("UNAVAILABLE");
    expect(mockStore.get("users/resp-1").activeIncidentId).toBeNull();

    // Command closes resolved incident
    await verifyAndCloseIncident("BM-2611-TEST01", "coord-1", "Verified");
    expect(mockStore.get("incidents/BM-2611-TEST01").status).toBe("Closed");
  });

  it("persists responder availability only after Firestore succeeds, rolls back on error, and blocks OFF_DUTY/VOLUNTEER dispatch", async () => {
    seedTransactionalFixtures({
      responder1: { dutyStatus: "ON_DUTY", activeIncidentId: null },
      responder2: { responderSubtype: "VOLUNTEER", dutyStatus: "AVAILABLE" },
    });
    mockResponderProfiles.set("resp-1", { uid: "resp-1", availabilityStatus: "UNAVAILABLE" });

    // 1. Firestore failure does NOT mutate local responderProfiles cache
    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
    mockUpdateDoc.mockRejectedValueOnce(new Error("Missing or insufficient permissions."));
    await expect(setResponderAvailability("resp-1", true)).rejects.toThrow(/Missing or insufficient permissions/i);
    expect(mockResponderProfiles.get("resp-1").availabilityStatus).toBe("UNAVAILABLE");

    // 2. Successful availability update persists AVAILABLE to Firestore and Dexie
    mockUpdateDoc.mockImplementationOnce(async (ref, patch) => {
      const cur = mockStore.get(ref.path) || {};
      mockStore.set(ref.path, { ...cur, ...patch });
    });
    mockSetDoc.mockResolvedValueOnce(undefined);
    const persisted = await setResponderAvailability("resp-1", true);
    expect(persisted).toBe("AVAILABLE");
    expect(mockResponderProfiles.get("resp-1").availabilityStatus).toBe("AVAILABLE");

    // 3. OFF_DUTY and VOLUNTEER responders cannot be dispatched by Command
    mockStore.set("users/resp-off", {
      uid: "resp-off",
      displayName: "Off Duty Pro",
      role: "RESPONDER",
      responderSubtype: "PROFESSIONAL",
      approvalStatus: "APPROVED",
      accountStatus: "ACTIVE",
      dutyStatus: "OFF_DUTY",
      activeIncidentId: null,
    });
    await expect(assignIncidentAtomic("BM-2611-TEST01", "resp-off", "coord-1")).rejects.toThrow(/OFF_DUTY/i);
    await expect(assignIncidentAtomic("BM-2611-TEST01", "resp-2", "coord-1")).rejects.toThrow(/Professional responders/i);

    // 4. Newly AVAILABLE Professional responder is eligible for Command dispatch
    await expect(assignIncidentAtomic("BM-2611-TEST01", "resp-1", "coord-1")).resolves.toMatchObject({
      assignmentId: "BM-2611-TEST01_resp-1",
    });
  });
});
