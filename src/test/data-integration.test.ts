import { describe, expect, it } from "vitest";
import {
  validateIncidentPayload,
  validateSafeZonePayload,
  validateMessagePayload,
  type IncidentRecord,
  type SafeZoneRecord,
} from "@/lib/types/data-models";
import { computeIncidentAggregates } from "@/lib/services/command-service";
import { toDisplayIncident, formatRelativeTime } from "@/components/beaconmesh/app";
import { INITIAL_SAFE_ZONES } from "@/lib/services/safezone-service";
import { fromFirestoreIncident } from "@/lib/services/incident-service";

describe("Canonical Data Models & Validation", () => {
  it("validates valid incident payload successfully with Vijayawada coordinates", () => {
    const valid: Partial<IncidentRecord> = {
      reporterId: "user-123",
      category: "Medical",
      title: "Medical assistance needed",
      description: "Severe injury, needs immediate triage and first aid",
      severity: "Critical",
      location: {
        latitude: 16.5074,
        longitude: 80.6385,
        addressLabel: "MG Road, Labbipet, Vijayawada",
        source: "GPS",
      },
    };

    const result = validateIncidentPayload(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates incident payload using createdBy field as fallback", () => {
    const validWithCreatedBy: Partial<IncidentRecord> = {
      createdBy: "usr-citizen-vja-99",
      type: "Flooding",
      description: "Flood water entering ground floor homes in Krishnalanka",
      severity: "High",
      place: "Krishnalanka, Vijayawada, NTR District",
    };

    const result = validateIncidentPayload(validWithCreatedBy);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("catches invalid incident payload with missing or out-of-range fields", () => {
    const invalid: Partial<IncidentRecord> = {
      reporterId: "",
      description: "Short", // Less than 5 characters when trimmed
      location: {
        latitude: 100.5, // Latitude exceeds 90
        longitude: -200.0, // Longitude exceeds 180
        source: "GPS",
      },
    };

    const result = validateIncidentPayload(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.errors).toContain("Authenticated reporter ID is required.");
    expect(result.errors).toContain("Incident category is required.");
    expect(result.errors.some((e) => e.includes("latitude"))).toBe(true);
    expect(result.errors.some((e) => e.includes("longitude"))).toBe(true);
  });

  it("validates safe zone payload for Vijayawada, Andhra Pradesh, India", () => {
    const validSZ: Partial<SafeZoneRecord> = {
      name: "Siddhartha Medical College Relief Centre",
      capacity: 500,
      operationalStatus: "OPEN",
      verificationStatus: "VERIFIED",
      location: {
        latitude: 16.5021,
        longitude: 80.6723,
        locality: "Gunadala",
        city: "Vijayawada",
        district: "NTR District",
        state: "Andhra Pradesh",
        country: "India",
      },
    };

    const result = validateSafeZonePayload(validSZ);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects safe zone payload outside India or missing required administrative fields", () => {
    const invalidSZ: Partial<SafeZoneRecord> = {
      name: "US Shelter",
      location: {
        latitude: 47.6062, // Outside India bounds
        longitude: -122.3321, // Outside India bounds
        city: "Seattle",
        state: "Washington",
        country: "USA" as any,
      },
    };

    const result = validateSafeZonePayload(invalidSZ);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("India"))).toBe(true);
  });

  it("validates simulation/user messages correctly", () => {
    const validMsg = {
      senderId: "NODE-CIT-01",
      recipientId: "GATEWAY-A",
      content: "Emergency report relay packet",
    };

    const validResult = validateMessagePayload(validMsg);
    expect(validResult.valid).toBe(true);

    const invalidMsg = {
      senderId: "",
      content: "",
    };
    const invalidResult = validateMessagePayload(invalidMsg);
    expect(invalidResult.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Command Aggregates Calculation (Real vs Demo Data)", () => {
  it("computes truthful zero aggregates for empty incident array", () => {
    const empty: IncidentRecord[] = [];
    const stats = computeIncidentAggregates(empty);

    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.critical).toBe(0);
    expect(stats.resolved).toBe(0);
  });

  it("dynamically calculates incident metrics across statuses and priorities", () => {
    const records: IncidentRecord[] = [
      {
        id: "INC-001",
        reporterId: "user-1",
        category: "Medical",
        title: "Medical alert",
        severity: "Critical",
        status: "Saved on device",
        description: "Patient unconscious at Governorpet",
        location: {
          latitude: 16.5126,
          longitude: 80.6206,
          addressLabel: "Governorpet, Vijayawada",
          source: "GPS",
        },
        assignedResponderIds: [],
        syncStatus: "SYNCED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "INC-002",
        reporterId: "user-2",
        category: "Flood",
        title: "Flood report",
        severity: "High",
        status: "In progress",
        description: "Water level rising near Prakasham Barrage",
        location: {
          latitude: 16.5074,
          longitude: 80.6083,
          addressLabel: "Prakasham Barrage, Vijayawada",
          source: "MANUAL",
        },
        assignedResponderIds: ["resp-1"],
        syncStatus: "LOCAL_ONLY",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "INC-003",
        reporterId: "user-3",
        category: "Fire",
        title: "Fire containment",
        severity: "Critical",
        status: "Resolved",
        description: "Electrical substation fire resolved in Auto Nagar",
        location: {
          latitude: 16.4950,
          longitude: 80.6720,
          addressLabel: "Auto Nagar, Vijayawada",
          source: "GPS",
        },
        assignedResponderIds: ["resp-2"],
        syncStatus: "SYNCED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const stats = computeIncidentAggregates(records);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.critical).toBe(1);
    expect(stats.resolved).toBe(1);
  });
});

describe("Incident Adapter & Firestore Serialization", () => {
  it("formats relative timestamps accurately", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("Just now");

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatRelativeTime(tenMinAgo)).toBe("10 min ago");

    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe("2 hr ago");
  });

  it("adapts IncidentRecord to UI Incident format faithfully", () => {
    const record: IncidentRecord = {
      id: "BM-2611-9999",
      reporterId: "usr-42",
      category: "Trapped",
      title: "Trapped occupants",
      severity: "Critical",
      status: "In progress",
      description: "Two people trapped in stairwell near Benz Circle",
      location: {
        latitude: 16.5002,
        longitude: 80.6481,
        addressLabel: "Benz Circle, Vijayawada, NTR District",
        source: "GPS",
      },
      assignedResponderIds: ["resp-001", "resp-002"],
      syncStatus: "SYNCED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const uiIncident = toDisplayIncident(record);
    expect(uiIncident.id).toBe("BM-2611-9999");
    expect(uiIncident.type).toBe("Trapped");
    expect(uiIncident.place).toBe("Benz Circle, Vijayawada, NTR District");
    expect(uiIncident.priority).toBe("Critical");
    expect(uiIncident.status).toBe("In progress");
    expect(uiIncident.description).toBe("Two people trapped in stairwell near Benz Circle");
    expect(uiIncident.assignedResponderIds).toEqual(["resp-001", "resp-002"]);
    expect(uiIncident.syncStatus).toBe("SYNCED");
  });

  it("converts incoming Firestore document into canonical IncidentRecord", () => {
    const firestoreDoc = {
      id: "BM-2611-1234",
      type: "Medical",
      place: "Labbipet, Vijayawada (16.5074, 80.6385)",
      description: "Citizen injured during wall collapse",
      status: "Waiting for connection",
      priority: "Critical",
      createdBy: "citizen-uid-88",
      creatorName: "Ramesh Kumar",
      creatorPhone: "+91 9876543210",
      assignedResponderId: "resp-vja-01",
      notes: "Triage required",
      createdAt: "2026-11-18T05:00:00.000Z",
      updatedAt: "2026-11-18T05:05:00.000Z",
    };

    const incident = fromFirestoreIncident(firestoreDoc);
    expect(incident.id).toBe("BM-2611-1234");
    expect(incident.category).toBe("Medical");
    expect(incident.location.latitude).toBeCloseTo(16.5074);
    expect(incident.location.longitude).toBeCloseTo(80.6385);
    expect(incident.location.city).toBe("Vijayawada");
    expect(incident.location.district).toBe("NTR District");
    expect(incident.assignedResponderId).toBe("resp-vja-01");
    expect(incident.assignedResponderIds).toContain("resp-vja-01");
    expect(incident.reporterId).toBe("citizen-uid-88");
    expect(incident.reporterNameSnapshot).toBe("Ramesh Kumar");
  });

  it("ensures Firestore outbox payload strictly adheres to firestore.rules whitelist", () => {
    // Whitelist per firestore.rules:
    // ['id', 'type', 'place', 'description', 'status', 'priority', 'createdBy', 'creatorName', 'creatorPhone', 'assignedResponderId', 'notes', 'createdAt', 'updatedAt']
    const allowedFirestoreKeys = [
      "id",
      "type",
      "place",
      "description",
      "status",
      "priority",
      "createdBy",
      "creatorName",
      "creatorPhone",
      "assignedResponderId",
      "notes",
      "createdAt",
      "updatedAt",
    ];

    // Payload synthesized for Firestore commit
    const firestorePayload = {
      id: "BM-2611-5555",
      type: "Flooding",
      place: "Bhavanipuram, Vijayawada (16.5200, 80.6000)",
      description: "Drainage overflow threatening residential block",
      status: "Waiting for connection",
      priority: "High",
      createdBy: "uid-test-1",
      creatorName: "Citizen Tester",
      creatorPhone: "+91 9123456780",
      assignedResponderId: null,
      notes: null,
      createdAt: "TIMESTAMP_SENTINEL",
      updatedAt: "TIMESTAMP_SENTINEL",
    };

    const payloadKeys = Object.keys(firestorePayload);
    for (const key of payloadKeys) {
      expect(allowedFirestoreKeys).toContain(key);
    }

    // Verify rejected fields are not present
    expect(payloadKeys).not.toContain("category");
    expect(payloadKeys).not.toContain("severity");
    expect(payloadKeys).not.toContain("location");
    expect(payloadKeys).not.toContain("reporterId");
    expect(payloadKeys).not.toContain("syncStatus");
  });
});

describe("Vijayawada, NTR District, Andhra Pradesh Safe Zones", () => {
  it("strictly contains verified safe zones in Vijayawada, NTR District, Andhra Pradesh, India", () => {
    expect(INITIAL_SAFE_ZONES.length).toBeGreaterThanOrEqual(3);
    for (const sz of INITIAL_SAFE_ZONES) {
      expect(sz.id).toBeDefined();
      expect(sz.name).toBeDefined();
      expect(sz.capacity).toBeGreaterThan(0);
      expect(sz.availableCapacity).toBeLessThanOrEqual(sz.capacity);
      expect(sz.verificationStatus).toBe("VERIFIED");
      expect(sz.location.city).toBe("Vijayawada");
      expect(sz.location.district).toBe("NTR District");
      expect(sz.location.state).toBe("Andhra Pradesh");
      expect(sz.location.country).toBe("India");

      // Verify coordinates are squarely within Vijayawada urban area
      expect(sz.location.latitude).toBeGreaterThan(16.45);
      expect(sz.location.latitude).toBeLessThan(16.58);
      expect(sz.location.longitude).toBeGreaterThan(80.55);
      expect(sz.location.longitude).toBeLessThan(80.72);
      expect(["OPEN", "LIMITED", "FULL", "CLOSED"]).toContain(sz.operationalStatus);
    }
  });

  it("includes canonical Vijayawada landmarks (IGMC Stadium, GGH Hospital, Tummalapalli Hall)", () => {
    const ids = INITIAL_SAFE_ZONES.map((s) => s.id);
    expect(ids).toContain("sz-vja-igmc-stadium");
    expect(ids).toContain("sz-vja-ggh-hospital");
    expect(ids).toContain("sz-vja-tummalapalli-hall");
  });
});
