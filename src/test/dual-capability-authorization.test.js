import { describe, expect, it } from "vitest";
import { normalizeUserProfile } from "@/lib/user-normalization";
import { updateResponderDutyStatus, updateResponderLocation, } from "@/lib/services/responder-service";
import { createEmergencyReport, } from "@/lib/services/incident-service";
import { runMigrationDryRun, processProfileForMigration } from "../../scripts/migrate-user-profiles";
describe("BeaconMesh v2.1 Dual-Capability & Authentication Invariants", () => {
    // Scenario 1: Pure Citizen registration
    it("Scenario 1: grants Citizen capability on standard Citizen registration", () => {
        const raw = {
            uid: "user-cit-001",
            email: "citizen1@example.com",
            role: "CITIZEN",
            registrationPath: "CITIZEN",
            emailVerified: true,
            accountStatus: "ACTIVE",
        };
        const normalized = normalizeUserProfile(raw);
        expect(normalized.capabilities).toEqual(["CITIZEN"]);
        expect(normalized.citizenEnrollmentStatus).toBe("ACTIVE");
        expect(normalized.responderApplicationStatus).toBe("NOT_APPLIED");
        expect(normalized.role).toBe("CITIZEN");
    });
    // Scenario 2: Pending-only Responder applicant
    it("Scenario 2: isolates pending-only responder applicants with zero capabilities (quarantine)", () => {
        const raw = {
            uid: "user-resp-pending-001",
            email: "volunteer@example.com",
            role: "CITIZEN",
            requestedRole: "RESPONDER",
            requestedResponderSubtype: "VOLUNTEER",
            registrationPath: "RESPONDER",
            approvalStatus: "PENDING",
            responderApplicationStatus: "PENDING",
            emailVerified: true,
            accountStatus: "ACTIVE",
        };
        const normalized = normalizeUserProfile(raw);
        // Mandatory requirement: Pending-only responder applicants must NOT receive Citizen dashboard access
        expect(normalized.capabilities).toEqual([]);
        expect(normalized.citizenEnrollmentStatus).toBe("INACTIVE");
        expect(normalized.responderApplicationStatus).toBe("PENDING");
        expect(normalized.role).toBe("CITIZEN");
    });
    // Scenario 3: Existing Citizen applying for Responder track
    it("Scenario 3: preserves Citizen capability for established Citizens applying for Responder track", () => {
        const raw = {
            uid: "user-cit-applying-002",
            email: "cit2@example.com",
            role: "CITIZEN",
            requestedRole: "RESPONDER",
            requestedResponderSubtype: "PROFESSIONAL",
            registrationPath: "CITIZEN",
            citizenEnrollmentStatus: "ACTIVE",
            approvalStatus: "PENDING",
            responderApplicationStatus: "PENDING",
            emailVerified: true,
            accountStatus: "ACTIVE",
        };
        const normalized = normalizeUserProfile(raw);
        expect(normalized.capabilities).toEqual(["CITIZEN"]);
        expect(normalized.citizenEnrollmentStatus).toBe("ACTIVE");
        expect(normalized.responderApplicationStatus).toBe("PENDING");
    });
    // Scenario 4: Approved Responder receives BOTH capabilities
    it("Scenario 4: grants DUAL capabilities ['CITIZEN', 'RESPONDER'] to approved Responders", () => {
        const raw = {
            uid: "user-resp-approved-003",
            email: "paramedic@example.com",
            role: "RESPONDER",
            responderSubtype: "PROFESSIONAL",
            approvalStatus: "APPROVED",
            responderApplicationStatus: "APPROVED",
            emailVerified: true,
            accountStatus: "ACTIVE",
            dutyStatus: "AVAILABLE",
        };
        const normalized = normalizeUserProfile(raw);
        expect(normalized.capabilities).toContain("CITIZEN");
        expect(normalized.capabilities).toContain("RESPONDER");
        expect(normalized.capabilities).toHaveLength(2);
        expect(normalized.citizenEnrollmentStatus).toBe("ACTIVE");
        expect(normalized.approvalStatus).toBe("APPROVED");
        expect(normalized.role).toBe("RESPONDER");
    });
    // Scenario 5: Ambiguous legacy profile migration classification (SAFEGUARD 1)
    it("Scenario 5 (Safeguard 1): classifies ambiguous legacy profiles without explicit evidence as AMBIGUOUS_MANUAL_REVIEW_REQUIRED", () => {
        // Legacy profile with role: CITIZEN, requestedRole: RESPONDER, approvalStatus: PENDING, but NO explicit registrationPath
        const legacyRaw = {
            uid: "user-legacy-004",
            email: "legacy@example.com",
            role: "CITIZEN",
            requestedRole: "RESPONDER",
            approvalStatus: "PENDING",
            emailVerified: true,
            accountStatus: "ACTIVE",
        };
        const normalized = normalizeUserProfile(legacyRaw);
        expect(normalized.migrationStatus).toBe("AMBIGUOUS_MANUAL_REVIEW_REQUIRED");
        // Must be quarantined: zero capabilities granted automatically
        expect(normalized.capabilities).toEqual([]);
        // Check migration dry-run classification
        const auditRecord = processProfileForMigration(legacyRaw, true);
        expect(auditRecord.classification).toBe("AMBIGUOUS_MANUAL_REVIEW_REQUIRED");
        expect(auditRecord.actionTaken).toBe("QUARANTINED_PENDING_MANUAL_REVIEW");
    });
    // Scenario 6: Rejection handling preserves Citizen only if independently enrolled
    it("Scenario 6: preserves Citizen capability on rejection only if previously enrolled", () => {
        // Case A: Was already an enrolled Citizen
        const citizenApplicant = {
            uid: "user-cit-rejected",
            email: "cit.rej@example.com",
            role: "CITIZEN",
            registrationPath: "CITIZEN",
            citizenEnrollmentStatus: "ACTIVE",
            approvalStatus: "REJECTED",
            responderApplicationStatus: "REJECTED",
        };
        const normA = normalizeUserProfile(citizenApplicant);
        expect(normA.capabilities).toEqual(["CITIZEN"]);
        // Case B: Registered as Responder-only
        const respOnlyApplicant = {
            uid: "user-resp-only-rejected",
            email: "resp.rej@example.com",
            role: "CITIZEN",
            registrationPath: "RESPONDER",
            citizenEnrollmentStatus: "INACTIVE",
            approvalStatus: "REJECTED",
            responderApplicationStatus: "REJECTED",
        };
        const normB = normalizeUserProfile(respOnlyApplicant);
        expect(normB.capabilities).toEqual([]);
    });
    // Scenario 7: Command account stability
    it("Scenario 7: maintains Command authority and role stability", () => {
        const coordinator = {
            uid: "user-coord-005",
            email: "coord@vmc.gov.in",
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            accountStatus: "ACTIVE",
            emailVerified: true,
        };
        const normalized = normalizeUserProfile(coordinator);
        expect(normalized.role).toBe("COMMAND");
        expect(normalized.commandLevel).toBe("COORDINATOR");
    });
});
describe("Safeguard 2: Location Telemetry Privacy & Deletion", () => {
    it("enforces coordinate bounds on responder location updates", async () => {
        await expect(updateResponderLocation("test-uid", {
            latitude: 95.0, // Invalid: > 90
            longitude: 80.648,
            dutyStatus: "AVAILABLE",
        })).rejects.toThrow("Latitude must be between -90 and 90 degrees");
        await expect(updateResponderLocation("test-uid", {
            latitude: 16.5,
            longitude: 185.0, // Invalid: > 180
            dutyStatus: "AVAILABLE",
        })).rejects.toThrow("Longitude must be between -180 and 180 degrees");
    });
});
describe("Safeguard 3: Assignment Integrity & Duty Status Lock", () => {
    it("locks responder from transitioning to OFF_DUTY or AVAILABLE while an incident is active", async () => {
        const assignedIncidentId = "BM-2611-9988";
        // Attempt to transition to OFF_DUTY while assigned must throw
        await expect(updateResponderDutyStatus("resp-uid-assigned", "OFF_DUTY", assignedIncidentId)).rejects.toThrow(/Cannot transition duty status to 'OFF_DUTY' while actively assigned/);
        // Attempt to transition to AVAILABLE while assigned must throw
        await expect(updateResponderDutyStatus("resp-uid-assigned", "AVAILABLE", assignedIncidentId)).rejects.toThrow(/Cannot transition duty status to 'AVAILABLE' while actively assigned/);
    });
});
describe("Safeguard 5: Zero Synthetic Coordinate Fallback for SOS", () => {
    it("creates incident with null coordinates and UNAVAILABLE source when GPS is unavailable", async () => {
        const input = {
            reporterId: "cit-real-user",
            category: "Medical",
            description: "Severe injury, emergency help needed immediately.",
            location: {
                latitude: null,
                longitude: null,
                source: "UNAVAILABLE",
                addressLabel: "Location Coordinates Unavailable",
                country: "India",
            },
        };
        const incident = await createEmergencyReport(input);
        expect(incident.location.latitude).toBeNull();
        expect(incident.location.longitude).toBeNull();
        expect(incident.location.source).toBe("UNAVAILABLE");
        // Ensure Vijayawada synthetic coords (16.5062, 80.648) were NOT injected
        expect(incident.location.latitude).not.toBe(16.5062);
        expect(incident.location.longitude).not.toBe(80.648);
    });
    it("retains exact coordinates when GPS is provided by the device", async () => {
        const input = {
            reporterId: "cit-real-user-gps",
            category: "Fire",
            description: "Kitchen fire spreading to adjacent roof.",
            location: {
                latitude: 16.5215,
                longitude: 80.6234,
                accuracyMeters: 8.5,
                source: "GPS",
                addressLabel: "GPS (16.5215, 80.6234)",
                country: "India",
            },
        };
        const incident = await createEmergencyReport(input);
        expect(incident.location.latitude).toBe(16.5215);
        expect(incident.location.longitude).toBe(80.6234);
        expect(incident.location.accuracyMeters).toBe(8.5);
        expect(incident.location.source).toBe("GPS");
    });
});
describe("Migration Dry-Run Audit Suite (Report D Verification)", () => {
    it("processes a diverse set of user profiles and reports exact classification counts", () => {
        const testProfiles = [
            // 1. Explicit Citizen
            {
                uid: "p1",
                email: "c1@test.com",
                role: "CITIZEN",
                registrationPath: "CITIZEN",
                emailVerified: true,
                accountStatus: "ACTIVE",
            },
            // 2. Explicit Citizen
            {
                uid: "p2",
                email: "c2@test.com",
                role: "CITIZEN",
                registrationPath: "CITIZEN",
                emailVerified: true,
                accountStatus: "ACTIVE",
            },
            // 3. Explicit Approved Responder
            {
                uid: "p3",
                email: "r1@test.com",
                role: "RESPONDER",
                responderSubtype: "PROFESSIONAL",
                approvalStatus: "APPROVED",
                registrationPath: "RESPONDER",
                emailVerified: true,
                accountStatus: "ACTIVE",
            },
            // 4. Explicit Pending Responder
            {
                uid: "p4",
                email: "r2@test.com",
                role: "CITIZEN",
                requestedRole: "RESPONDER",
                requestedResponderSubtype: "VOLUNTEER",
                registrationPath: "RESPONDER",
                approvalStatus: "PENDING",
                emailVerified: true,
                accountStatus: "ACTIVE",
            },
            // 5. Ambiguous Legacy Profile (NO registrationPath, requestedRole: RESPONDER)
            {
                uid: "p5",
                email: "ambig1@test.com",
                role: "CITIZEN",
                requestedRole: "RESPONDER",
                approvalStatus: "PENDING",
                emailVerified: true,
                accountStatus: "ACTIVE",
            },
            // 6. Ambiguous Legacy Profile 2
            {
                uid: "p6",
                email: "ambig2@test.com",
                role: "CITIZEN",
                requestedRole: "RESPONDER",
                approvalStatus: "PENDING",
                emailVerified: false,
                accountStatus: "ACTIVE",
            },
            // 7. Command Coordinator
            {
                uid: "p7",
                email: "coord@test.com",
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            },
            // 8. Suspended Account
            {
                uid: "p8",
                email: "bad@test.com",
                role: "CITIZEN",
                accountStatus: "SUSPENDED",
            },
        ];
        const report = runMigrationDryRun(testProfiles);
        expect(report.mode).toBe("DRY_RUN");
        expect(report.totalScanned).toBe(8);
        expect(report.counts.explicitCitizen).toBe(2);
        expect(report.counts.explicitApprovedResponder).toBe(1);
        expect(report.counts.explicitPendingResponder).toBe(1);
        expect(report.counts.ambiguousManualReviewRequired).toBe(2);
        expect(report.counts.commandStaff).toBe(1);
        expect(report.counts.suspended).toBe(1);
        // Verify quarantined records
        const quarantined = report.auditLog.filter((r) => r.actionTaken === "QUARANTINED_PENDING_MANUAL_REVIEW");
        expect(quarantined).toHaveLength(2);
        expect(quarantined[0].projected.capabilities).toEqual([]);
        expect(quarantined[1].projected.capabilities).toEqual([]);
    });
});
