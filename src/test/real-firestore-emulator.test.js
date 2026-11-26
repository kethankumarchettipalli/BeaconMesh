import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { initializeTestEnvironment, assertSucceeds, assertFails, } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import * as fs from "node:fs";
import * as path from "node:path";
describe("Real Firestore Emulator Security Rules & Attack Vector Audit", () => {
    let testEnv;
    const projectId = "beaconmesh-audit-test";
    beforeAll(async () => {
        process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";
        const rulesPath = path.resolve(process.cwd(), "firestore.rules");
        const rules = fs.readFileSync(rulesPath, "utf8");
        testEnv = await initializeTestEnvironment({
            projectId,
            firestore: {
                host: "127.0.0.1",
                port: 8088,
                rules,
            },
        });
    });
    afterAll(async () => {
        if (testEnv) {
            await testEnv.cleanup();
        }
    });
    beforeEach(async () => {
        if (testEnv) {
            await testEnv.clearFirestore();
        }
    });
    // 1. Unauthenticated request verification
    it("FR 1: rejects unauthenticated read and write operations", async () => {
        const unauthed = testEnv.unauthenticatedContext();
        const db = unauthed.firestore();
        const testDoc = doc(db, "users", "any-user");
        await assertFails(getDoc(testDoc));
        await assertFails(setDoc(testDoc, { role: "CITIZEN" }));
    });
    // 2. Citizen Self-Registration
    it("FR 2: allows valid self-registration via Citizen track", async () => {
        const uid = "citizen-alice";
        const alice = testEnv.authenticatedContext(uid, {
            email: "alice@example.com",
            email_verified: true,
        });
        const db = alice.firestore();
        const citizenDoc = {
            uid,
            displayName: "Alice Citizen",
            email: "alice@example.com",
            role: "CITIZEN",
            responderSubtype: null,
            commandLevel: null,
            requestedRole: null,
            requestedResponderSubtype: null,
            capabilities: ["CITIZEN"],
            citizenEnrollmentStatus: "ACTIVE",
            responderApplicationStatus: "NOT_APPLIED",
            registrationPath: "CITIZEN",
            approvalStatus: "NOT_REQUIRED",
            phoneVerified: false,
            emailVerified: true,
            accountStatus: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await assertSucceeds(setDoc(doc(db, "users", uid), citizenDoc));
    });
    // 3. Responder Self-Registration (Quarantined)
    it("FR 3: allows responder self-registration with quarantined capabilities", async () => {
        const uid = "volunteer-bob";
        const bob = testEnv.authenticatedContext(uid, {
            email: "bob@example.com",
            email_verified: true,
        });
        const db = bob.firestore();
        const responderDoc = {
            uid,
            displayName: "Bob Applicant",
            email: "bob@example.com",
            role: "CITIZEN",
            responderSubtype: null,
            commandLevel: null,
            capabilities: [],
            citizenEnrollmentStatus: "INACTIVE",
            responderApplicationStatus: "PENDING",
            registrationPath: "RESPONDER",
            requestedRole: "RESPONDER",
            requestedResponderSubtype: "VOLUNTEER",
            approvalStatus: "PENDING",
            phoneVerified: false,
            emailVerified: true,
            accountStatus: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await assertSucceeds(setDoc(doc(db, "users", uid), responderDoc));
    });
    // SEC-01 Attack: Unverified email token is rejected
    it("SEC-01 Attack: rejects self-registration when auth token is unverified", async () => {
        const uid = "unverified-charlie";
        const charlie = testEnv.authenticatedContext(uid, {
            email: "charlie@example.com",
            email_verified: false,
        });
        const db = charlie.firestore();
        const unverifiedDoc = {
            uid,
            displayName: "Charlie Unverified",
            email: "charlie@example.com",
            role: "CITIZEN",
            responderSubtype: null,
            commandLevel: null,
            requestedRole: null,
            requestedResponderSubtype: null,
            capabilities: ["CITIZEN"],
            citizenEnrollmentStatus: "ACTIVE",
            responderApplicationStatus: "NOT_APPLIED",
            registrationPath: "CITIZEN",
            approvalStatus: "NOT_REQUIRED",
            phoneVerified: false,
            emailVerified: true,
            accountStatus: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        await assertFails(setDoc(doc(db, "users", uid), unverifiedDoc));
    });
    // 4. Attack Test: Citizen cannot write responder locations
    it("Attack 1: Citizen cannot write responder locations", async () => {
        const uid = "citizen-attacker";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", uid), {
                uid,
                displayName: "Citizen Attacker",
                email: "attacker@example.com",
                role: "CITIZEN",
                capabilities: ["CITIZEN"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "NOT_REQUIRED",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const citizenContext = testEnv.authenticatedContext(uid, {
            email: "attacker@example.com",
            email_verified: true,
        });
        const db = citizenContext.firestore();
        // Citizen attempting to write location document
        await assertFails(setDoc(doc(db, "responderLocations", uid), {
            uid,
            latitude: 16.5062,
            longitude: 80.648,
            dutyStatus: "AVAILABLE",
            activeIncidentId: null,
        }));
    });
    // 5. Attack Test: Pending Responder cannot write responder locations
    it("Attack 2: Pending Responder cannot write responder locations", async () => {
        const uid = "pending-responder";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", uid), {
                uid,
                displayName: "Pending Responder",
                email: "pending@example.com",
                role: "CITIZEN",
                requestedRole: "RESPONDER",
                capabilities: [],
                citizenEnrollmentStatus: "INACTIVE",
                responderApplicationStatus: "PENDING",
                approvalStatus: "PENDING",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const pendingContext = testEnv.authenticatedContext(uid, {
            email: "pending@example.com",
            email_verified: true,
        });
        const db = pendingContext.firestore();
        await assertFails(setDoc(doc(db, "responderLocations", uid), {
            uid,
            latitude: 16.5062,
            longitude: 80.648,
            dutyStatus: "AVAILABLE",
            activeIncidentId: null,
        }));
    });
    // 6. Attack Test: OFF_DUTY Responder cannot publish location
    it("Attack 3: OFF_DUTY Responder cannot publish location", async () => {
        const uid = "offduty-responder";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", uid), {
                uid,
                displayName: "Off-Duty Medic",
                email: "medic@example.com",
                role: "RESPONDER",
                responderSubtype: "PROFESSIONAL",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const offDutyContext = testEnv.authenticatedContext(uid, {
            email: "medic@example.com",
            email_verified: true,
        });
        const db = offDutyContext.firestore();
        // Off-duty responder attempting to publish location
        await assertFails(setDoc(doc(db, "responderLocations", uid), {
            uid,
            latitude: 16.5062,
            longitude: 80.648,
            dutyStatus: "OFF_DUTY",
            activeIncidentId: null,
        }));
    });
    // 7. Attack Test: Responder cannot modify their own activeIncidentId
    it("Attack 4: Responder cannot modify their own activeIncidentId", async () => {
        const uid = "responder-tamper";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", uid), {
                uid,
                displayName: "Field Responder",
                email: "field@example.com",
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const responderContext = testEnv.authenticatedContext(uid, {
            email: "field@example.com",
            email_verified: true,
        });
        const db = responderContext.firestore();
        // Responder attempting to unilaterally set activeIncidentId
        await assertFails(updateDoc(doc(db, "users", uid), {
            activeIncidentId: "BM-ILLEGAL-9999",
            updatedAt: new Date(),
        }));
    });
    // 8. Attack Test: Responder cannot self-dispatch
    it("Attack 5: Responder cannot self-dispatch to DISPATCHED status", async () => {
        const uid = "responder-self-dispatch";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", uid), {
                uid,
                displayName: "Self Dispatcher",
                email: "selfdisp@example.com",
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const responderContext = testEnv.authenticatedContext(uid, {
            email: "selfdisp@example.com",
            email_verified: true,
        });
        const db = responderContext.firestore();
        // Responder attempting to set dutyStatus: DISPATCHED on their own profile
        await assertFails(updateDoc(doc(db, "users", uid), {
            dutyStatus: "DISPATCHED",
            updatedAt: new Date(),
        }));
    });
    // 9. Attack Test: Coordinator cannot assign an OFF_DUTY Responder
    it("Attack 6: Coordinator cannot assign an OFF_DUTY Responder", async () => {
        const coordUid = "coord-01";
        const respUid = "resp-offduty-01";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", coordUid), {
                uid: coordUid,
                displayName: "Control Officer",
                email: "coord@vmc.gov.in",
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(context.firestore(), "users", respUid), {
                uid: respUid,
                displayName: "Off-Duty Volunteer",
                email: "vol.off@example.com",
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const coordContext = testEnv.authenticatedContext(coordUid, {
            email: "coord@vmc.gov.in",
            email_verified: true,
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            accountStatus: "ACTIVE",
        });
        const db = coordContext.firestore();
        // Coordinator attempting to dispatch an OFF_DUTY responder
        await assertFails(updateDoc(doc(db, "users", respUid), {
            dutyStatus: "DISPATCHED",
            activeIncidentId: "BM-2611-1234",
            updatedAt: new Date(),
        }));
    });
    // 10. Attack Test: Responder cannot delete another user's location
    it("Attack 7: Responder cannot delete another user's location", async () => {
        const userA = "responder-a";
        const userB = "responder-b";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", userA), {
                uid: userA,
                displayName: "User A",
                email: "a@example.com",
                role: "RESPONDER",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(context.firestore(), "responderLocations", userA), {
                uid: userA,
                latitude: 16.51,
                longitude: 80.65,
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
            });
        });
        const userBContext = testEnv.authenticatedContext(userB, {
            email: "b@example.com",
            email_verified: true,
        });
        const db = userBContext.firestore();
        // User B attempting to delete User A's location
        await assertFails(deleteDoc(doc(db, "responderLocations", userA)));
    });
    // 11. Attack Test: Unauthorized user cannot alter assignments
    it("Attack 8: Unauthorized users cannot alter assignments", async () => {
        const citizenUid = "cit-attacker-01";
        const assignmentId = "BM-2408-001_resp-123";
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "incidentAssignments", assignmentId), {
                id: assignmentId,
                incidentId: "BM-2408-001",
                responderId: "resp-123",
                status: "ACTIVE",
            });
        });
        const citizenContext = testEnv.authenticatedContext(citizenUid, {
            email: "citizen@example.com",
            email_verified: true,
        });
        const db = citizenContext.firestore();
        // Unauthorized citizen attempting to update assignment
        await assertFails(updateDoc(doc(db, "incidentAssignments", assignmentId), {
            status: "CANCELLED",
        }));
    });
    // ===============================================================
    // TASK 2: ATOMIC ASSIGNMENT & GETAFTER() INTEGRITY AUDIT
    // ===============================================================
    it("Atomic 1: Valid assignment atomically updates incident, assignment record and responder profile", async () => {
        const coordUid = "cmd-coord-01";
        const respUid = "resp-avail-01";
        const incId = "BM-2611-ATOM01";
        const assignmentId = `${incId}_${respUid}`;
        // Seed test fixtures
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const fdb = context.firestore();
            const pastTime = new Date(Date.now() - 5000);
            // Command user
            await setDoc(doc(fdb, "users", coordUid), {
                uid: coordUid,
                displayName: "Coordinator Alpha",
                email: "coord@vmc.gov.in",
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                responderSubtype: null,
                requestedRole: null,
                requestedResponderSubtype: null,
                approvalStatus: "NOT_REQUIRED",
                capabilities: ["COMMAND"],
                citizenEnrollmentStatus: "INACTIVE",
                responderApplicationStatus: "NOT_APPLIED",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: pastTime,
                updatedAt: pastTime,
            });
            // Available responder
            await setDoc(doc(fdb, "users", respUid), {
                uid: respUid,
                displayName: "Paramedic Kumar",
                email: "kumar@beaconmesh.org",
                role: "RESPONDER",
                responderSubtype: "PROFESSIONAL",
                commandLevel: null,
                requestedRole: "RESPONDER",
                requestedResponderSubtype: "PROFESSIONAL",
                registrationPath: "RESPONDER",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: pastTime,
                updatedAt: pastTime,
            });
            // Incident waiting for connection
            await setDoc(doc(fdb, "incidents", incId), {
                id: incId,
                type: "Medical",
                place: "Benz Circle, Vijayawada",
                description: "Patient conscious but needs immediate medical triage",
                status: "Waiting for connection",
                priority: "Critical",
                createdBy: "citizen-reporter",
                createdAt: pastTime,
                updatedAt: pastTime,
            });
        });
        const coordContext = testEnv.authenticatedContext(coordUid, {
            email: "coord@vmc.gov.in",
            email_verified: true,
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            accountStatus: "ACTIVE",
        });
        const db = coordContext.firestore();
        const writeTime = new Date(Date.now() - 1000);
        const batch = writeBatch(db);
        batch.update(doc(db, "incidents", incId), {
            status: "In progress",
            assignedResponderId: respUid,
            updatedAt: writeTime,
        });
        batch.update(doc(db, "users", respUid), {
            dutyStatus: "DISPATCHED",
            activeIncidentId: incId,
            updatedAt: writeTime,
        });
        batch.set(doc(db, "incidentAssignments", assignmentId), {
            id: assignmentId,
            incidentId: incId,
            responderId: respUid,
            status: "ACTIVE",
            assignedBy: coordUid,
            assignedAt: writeTime,
            updatedAt: writeTime,
        });
        await assertSucceeds(batch.commit());
        // Verify all 3 documents reflect the atomic update
        const unauthed = testEnv.unauthenticatedContext();
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const fdb = context.firestore();
            const incSnap = await getDoc(doc(fdb, "incidents", incId));
            const userSnap = await getDoc(doc(fdb, "users", respUid));
            const assignSnap = await getDoc(doc(fdb, "incidentAssignments", assignmentId));
            expect(incSnap.data()?.status).toBe("In progress");
            expect(incSnap.data()?.assignedResponderId).toBe(respUid);
            expect(userSnap.data()?.dutyStatus).toBe("DISPATCHED");
            expect(userSnap.data()?.activeIncidentId).toBe(incId);
            expect(assignSnap.data()?.status).toBe("ACTIVE");
        });
    });
    it("Atomic 2: OFF_DUTY Responder cannot be assigned", async () => {
        const coordUid = "cmd-coord-02";
        const respUid = "resp-offduty-02";
        const incId = "BM-2611-ATOM02";
        const assignmentId = `${incId}_${respUid}`;
        // Seed test fixtures with OFF_DUTY responder
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const fdb = context.firestore();
            await setDoc(doc(fdb, "users", coordUid), {
                uid: coordUid,
                displayName: "Coordinator Beta",
                email: "coord2@vmc.gov.in",
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(fdb, "users", respUid), {
                uid: respUid,
                displayName: "Off Duty Volunteer",
                email: "offduty@beaconmesh.org",
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(fdb, "incidents", incId), {
                id: incId,
                type: "Flood",
                place: "Bhavanipuram, Vijayawada",
                description: "Water level rising",
                status: "Waiting for connection",
                priority: "High",
                createdBy: "citizen-reporter-2",
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const coordContext = testEnv.authenticatedContext(coordUid, {
            email: "coord2@vmc.gov.in",
            email_verified: true,
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            accountStatus: "ACTIVE",
        });
        const db = coordContext.firestore();
        // Coordinator attempting atomic assignment on OFF_DUTY responder must be rejected
        const batch = writeBatch(db);
        batch.update(doc(db, "incidents", incId), {
            status: "In progress",
            assignedResponderId: respUid,
            updatedAt: new Date(),
        });
        batch.update(doc(db, "users", respUid), {
            dutyStatus: "DISPATCHED",
            activeIncidentId: incId,
            updatedAt: new Date(),
        });
        batch.set(doc(db, "incidentAssignments", assignmentId), {
            id: assignmentId,
            incidentId: incId,
            responderId: respUid,
            status: "ACTIVE",
            assignedBy: coordUid,
            assignedAt: new Date(),
            updatedAt: new Date(),
        });
        await assertFails(batch.commit());
    });
    it("Atomic 3: An invalid write causes the entire batch to fail without partial updates", async () => {
        const coordUid = "cmd-coord-03";
        const respUid = "resp-avail-03";
        const incId = "BM-2611-ATOM03";
        const assignmentId = `${incId}_${respUid}`;
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const fdb = context.firestore();
            await setDoc(doc(fdb, "users", coordUid), {
                uid: coordUid,
                displayName: "Coordinator Gamma",
                email: "coord3@vmc.gov.in",
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(fdb, "users", respUid), {
                uid: respUid,
                displayName: "Available Medic",
                email: "medic3@beaconmesh.org",
                role: "RESPONDER",
                responderSubtype: "PROFESSIONAL",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(fdb, "incidents", incId), {
                id: incId,
                type: "Fire",
                place: "One Town, Vijayawada",
                description: "Small electrical fire",
                status: "Waiting for connection",
                priority: "High",
                createdBy: "citizen-reporter-3",
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const coordContext = testEnv.authenticatedContext(coordUid, {
            email: "coord3@vmc.gov.in",
            email_verified: true,
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            accountStatus: "ACTIVE",
        });
        const db = coordContext.firestore();
        const batch = writeBatch(db);
        // 1. Valid incident update
        batch.update(doc(db, "incidents", incId), {
            status: "In progress",
            assignedResponderId: respUid,
            updatedAt: new Date(),
        });
        // 2. INVALID user update (Coordinator attempting to illegally elevate responder to COMMAND)
        batch.update(doc(db, "users", respUid), {
            role: "COMMAND", // Forbidden for coordinator!
            commandLevel: "ADMINISTRATOR",
            updatedAt: new Date(),
        });
        // 3. Assignment record
        batch.set(doc(db, "incidentAssignments", assignmentId), {
            id: assignmentId,
            incidentId: incId,
            responderId: respUid,
            status: "ACTIVE",
            assignedBy: coordUid,
            assignedAt: new Date(),
            updatedAt: new Date(),
        });
        // Entire batch must fail
        await assertFails(batch.commit());
        // Verify ZERO partial updates occurred: incident MUST remain in original state
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const fdb = context.firestore();
            const incSnap = await getDoc(doc(fdb, "incidents", incId));
            const userSnap = await getDoc(doc(fdb, "users", respUid));
            const assignSnap = await getDoc(doc(fdb, "incidentAssignments", assignmentId));
            // Invariants preserved: no partial mutation
            expect(incSnap.data()?.status).toBe("Waiting for connection");
            expect(incSnap.data()?.assignedResponderId).toBeUndefined();
            expect(userSnap.data()?.dutyStatus).toBe("AVAILABLE");
            expect(userSnap.data()?.role).toBe("RESPONDER");
            expect(assignSnap.exists()).toBe(false);
        });
    });
    it("Atomic 4: getAfter() rules reject assignment record if responder profile is not atomically dispatched", async () => {
        const coordUid = "cmd-coord-04";
        const respUid = "resp-avail-04";
        const incId = "BM-2611-ATOM04";
        const assignmentId = `${incId}_${respUid}`;
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const fdb = context.firestore();
            await setDoc(doc(fdb, "users", coordUid), {
                uid: coordUid,
                displayName: "Coordinator Delta",
                email: "coord4@vmc.gov.in",
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(fdb, "users", respUid), {
                uid: respUid,
                displayName: "Available Medic 4",
                email: "medic4@beaconmesh.org",
                role: "RESPONDER",
                responderSubtype: "PROFESSIONAL",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                approvalStatus: "APPROVED",
                dutyStatus: "AVAILABLE",
                activeIncidentId: null,
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await setDoc(doc(fdb, "incidents", incId), {
                id: incId,
                type: "Medical",
                place: "Governorpet, Vijayawada",
                description: "Breathing difficulty",
                status: "Waiting for connection",
                priority: "Critical",
                createdBy: "citizen-reporter-4",
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        const coordContext = testEnv.authenticatedContext(coordUid, {
            email: "coord4@vmc.gov.in",
            email_verified: true,
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            accountStatus: "ACTIVE",
        });
        const db = coordContext.firestore();
        // Coordinator attempts to create assignment record WITHOUT updating responder user profile
        // getAfter() checks users/{respUid}.activeIncidentId == incId and dutyStatus == 'DISPATCHED'
        const batch = writeBatch(db);
        batch.update(doc(db, "incidents", incId), {
            status: "In progress",
            assignedResponderId: respUid,
            updatedAt: new Date(),
        });
        // OMITTING users/{respUid} dispatch update!
        batch.set(doc(db, "incidentAssignments", assignmentId), {
            id: assignmentId,
            incidentId: incId,
            responderId: respUid,
            status: "ACTIVE",
            assignedBy: coordUid,
            assignedAt: new Date(),
            updatedAt: new Date(),
        });
        // getAfter() rule violation must reject the write
        await assertFails(batch.commit());
    });
    // ===============================================================
    // TASK: PHASE 0 COMMAND PRIVILEGE SECURITY HOTFIX TESTS
    // ===============================================================
    describe("Phase 0: Command Privilege Security Hotfix Tests", () => {
        const adminUid = "admin-hotfix-01";
        const coordUid = "coord-hotfix-01";
        const citizenUid = "cit-hotfix-01";
        const responderUid = "resp-hotfix-01";
        beforeEach(async () => {
            // Seed test fixtures
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const now = new Date();
                // Administrator user
                await setDoc(doc(fdb, "users", adminUid), {
                    uid: adminUid,
                    displayName: "System Administrator",
                    email: "admin@beaconmesh.org",
                    role: "COMMAND",
                    commandLevel: "ADMINISTRATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Coordinator user
                await setDoc(doc(fdb, "users", coordUid), {
                    uid: coordUid,
                    displayName: "Field Coordinator",
                    email: "coord@beaconmesh.org",
                    role: "COMMAND",
                    commandLevel: "COORDINATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Citizen user
                await setDoc(doc(fdb, "users", citizenUid), {
                    uid: citizenUid,
                    displayName: "Citizen User",
                    email: "citizen@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Responder user
                await setDoc(doc(fdb, "users", responderUid), {
                    uid: responderUid,
                    displayName: "Volunteer Responder",
                    email: "responder@example.com",
                    role: "RESPONDER",
                    commandLevel: null,
                    responderSubtype: "VOLUNTEER",
                    capabilities: ["CITIZEN", "RESPONDER"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "APPROVED",
                    approvalStatus: "APPROVED",
                    dutyStatus: "OFF_DUTY",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
            });
        });
        // 1. Administrator cannot promote a Citizen to COMMAND
        it("Hotfix 1: Administrator cannot promote a Citizen to COMMAND", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                role: "COMMAND",
                updatedAt: new Date(),
            }));
            // Verify rejected write left document unchanged
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.role).toBe("CITIZEN");
            });
        });
        // 2. Administrator cannot change another user's commandLevel
        it("Hotfix 2: Administrator cannot change another user's commandLevel", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                commandLevel: "COORDINATOR",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.commandLevel).toBeNull();
            });
        });
        // 3. Administrator cannot promote another user to ADMINISTRATOR
        it("Hotfix 3: Administrator cannot promote another user to ADMINISTRATOR", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.role).toBe("CITIZEN");
                expect(snap.data()?.commandLevel).toBeNull();
            });
        });
        // 4. Administrator cannot promote another user to COORDINATOR
        it("Hotfix 4: Administrator cannot promote another user to COORDINATOR", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", responderUid), {
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", responderUid));
                expect(snap.data()?.role).toBe("RESPONDER");
                expect(snap.data()?.commandLevel).toBeNull();
            });
        });
        // 5. Administrator cannot modify their own commandLevel
        it("Hotfix 5: Administrator cannot modify their own commandLevel", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", adminUid), {
                commandLevel: "COORDINATOR",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", adminUid));
                expect(snap.data()?.commandLevel).toBe("ADMINISTRATOR");
            });
        });
        // 6. Coordinator cannot modify Command permission levels
        it("Hotfix 6: Coordinator cannot modify Command permission levels", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coord@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.role).toBe("CITIZEN");
                expect(snap.data()?.commandLevel).toBeNull();
            });
        });
        // 7. Citizen cannot modify another user's role or capabilities
        it("Hotfix 7: Citizen cannot modify another user's role or capabilities", async () => {
            const citCtx = testEnv.authenticatedContext(citizenUid, {
                email: "citizen@example.com",
                email_verified: true,
            });
            const db = citCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", responderUid), {
                role: "CITIZEN",
                capabilities: ["CITIZEN"],
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", responderUid));
                expect(snap.data()?.role).toBe("RESPONDER");
                expect(snap.data()?.capabilities).toEqual(["CITIZEN", "RESPONDER"]);
            });
        });
        // 8. Unauthenticated users cannot modify profiles
        it("Hotfix 8: Unauthenticated users cannot modify profiles", async () => {
            const unauthed = testEnv.unauthenticatedContext();
            const db = unauthed.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                displayName: "Hacked Name",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.displayName).toBe("Citizen User");
            });
        });
        // 9. Administrator cannot delete arbitrary user profiles
        it("Hotfix 9: Administrator cannot delete arbitrary user profiles", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(deleteDoc(doc(db, "users", citizenUid)));
            // Verify profile was NOT deleted
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.exists()).toBe(true);
            });
        });
        // 10. Existing permitted Administrator operations on Citizen/Responder profiles continue to work
        it("Hotfix 10: Existing permitted Administrator operations on Citizen/Responder profiles continue to work", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            // Administrator suspending an account
            await assertSucceeds(updateDoc(doc(db, "users", citizenUid), {
                accountStatus: "SUSPENDED",
                updatedAt: serverTimestamp(),
            }));

            // Administrator updating profile display name and phone
            await assertSucceeds(updateDoc(doc(db, "users", responderUid), {
                displayName: "Promoted Field Lead",
                phoneNumber: "+91 9876543210",
                updatedAt: serverTimestamp(),
            }));

            // Phase 0.2: Administrator cannot modify responderSubtype via generic admin update
            await assertFails(updateDoc(doc(db, "users", responderUid), {
                responderSubtype: "PROFESSIONAL",
                updatedAt: serverTimestamp(),
            }));
            // Verify persisted updates
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const citSnap = await getDoc(doc(context.firestore(), "users", citizenUid));
                const respSnap = await getDoc(doc(context.firestore(), "users", responderUid));
                expect(citSnap.data()?.accountStatus).toBe("SUSPENDED");
                expect(respSnap.data()?.displayName).toBe("Promoted Field Lead");
                expect(respSnap.data()?.phoneNumber).toBe("+91 9876543210");
            });
        });
    });
    // ===============================================================
    // PHASE 0.2: OPERATIONAL STATE-MACHINE SECURITY HARDENING TESTS
    // ===============================================================
    describe("Phase 0.2: Operational State-Machine Security Hardening Tests", () => {
        const adminUid = "admin-p02-01";
        const coordUid = "coord-p02-01";
        const citizenUid = "cit-p02-01";
        const responderUid = "resp-p02-01";
        const applicantUid = "appl-p02-01";
        const unverifiedUid = "unver-p02-01";
        beforeEach(async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const now = new Date();
                // Administrator user
                await setDoc(doc(fdb, "users", adminUid), {
                    uid: adminUid,
                    displayName: "Phase 0.2 Admin",
                    email: "admin02@beaconmesh.org",
                    role: "COMMAND",
                    commandLevel: "ADMINISTRATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Coordinator user
                await setDoc(doc(fdb, "users", coordUid), {
                    uid: coordUid,
                    displayName: "Phase 0.2 Coordinator",
                    email: "coord02@beaconmesh.org",
                    role: "COMMAND",
                    commandLevel: "COORDINATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Citizen user
                await setDoc(doc(fdb, "users", citizenUid), {
                    uid: citizenUid,
                    displayName: "Citizen Alpha",
                    email: "cit02@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Responder user
                await setDoc(doc(fdb, "users", responderUid), {
                    uid: responderUid,
                    displayName: "Volunteer Responder Beta",
                    email: "resp02@example.com",
                    role: "RESPONDER",
                    commandLevel: null,
                    responderSubtype: "VOLUNTEER",
                    capabilities: ["CITIZEN", "RESPONDER"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "APPROVED",
                    approvalStatus: "APPROVED",
                    dutyStatus: "OFF_DUTY",
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Verified Responder Applicant
                await setDoc(doc(fdb, "users", applicantUid), {
                    uid: applicantUid,
                    displayName: "Pending Applicant Gamma",
                    email: "applicant02@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    requestedRole: "RESPONDER",
                    requestedResponderSubtype: "VOLUNTEER",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    dutyStatus: null,
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
                // Unverified Responder Applicant
                await setDoc(doc(fdb, "users", unverifiedUid), {
                    uid: unverifiedUid,
                    displayName: "Unverified Applicant Delta",
                    email: "unverified02@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    requestedRole: "RESPONDER",
                    requestedResponderSubtype: "VOLUNTEER",
                    capabilities: [],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    dutyStatus: null,
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: false,
                    createdAt: now,
                    updatedAt: now,
                });
            });
        });
        // 1. Administrator cannot grant capabilities: ['COMMAND'] to a Citizen
        it("Hardening 1: Administrator cannot grant capabilities: ['COMMAND'] to a Citizen", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                capabilities: ["CITIZEN", "COMMAND"],
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.capabilities).toEqual(["CITIZEN"]);
            });
        });
        // 2. Administrator cannot grant Responder capability to an unapproved Citizen
        it("Hardening 2: Administrator cannot grant Responder capability to an unapproved Citizen", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                capabilities: ["CITIZEN", "RESPONDER"],
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.capabilities).toEqual(["CITIZEN"]);
            });
        });
        // 3. Administrator cannot directly change approvalStatus to APPROVED
        it("Hardening 3: Administrator cannot directly change approvalStatus to APPROVED", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", applicantUid), {
                approvalStatus: "APPROVED",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", applicantUid));
                expect(snap.data()?.approvalStatus).toBe("PENDING");
            });
        });
        // 4. Administrator cannot approve an unverified Responder
        it("Hardening 4: Administrator cannot approve an unverified Responder", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            // Attempting vetting update on unverified email applicant must be rejected
            await assertFails(updateDoc(doc(db, "users", unverifiedUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: adminUid,
                reviewedAt: new Date(),
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", unverifiedUid));
                expect(snap.data()?.approvalStatus).toBe("PENDING");
                expect(snap.data()?.role).toBe("CITIZEN");
            });
        });
        // 5. Administrator cannot change a user's role through generic profile updates
        it("Hardening 5: Administrator cannot change a user's role through generic profile updates", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", citizenUid), {
                role: "RESPONDER",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.role).toBe("CITIZEN");
            });
        });
        // 6. Administrator cannot directly set dutyStatus to DISPATCHED
        it("Hardening 6: Administrator cannot directly set dutyStatus to DISPATCHED", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", responderUid), {
                dutyStatus: "DISPATCHED",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", responderUid));
                expect(snap.data()?.dutyStatus).toBe("OFF_DUTY");
            });
        });
        // 7. Administrator cannot directly set activeIncidentId
        it("Hardening 7: Administrator cannot directly set activeIncidentId", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", responderUid), {
                activeIncidentId: "BM-ROGUE-999",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", responderUid));
                expect(snap.data()?.activeIncidentId).toBeNull();
            });
        });
        // 8. Administrator cannot clear an active responder's assignment
        it("Hardening 8: Administrator cannot clear an active responder's assignment", async () => {
            const assignedRespUid = "resp-assigned-p02";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                await setDoc(doc(context.firestore(), "users", assignedRespUid), {
                    uid: assignedRespUid,
                    displayName: "Dispatched Paramedic",
                    email: "dispatched@example.com",
                    role: "RESPONDER",
                    responderSubtype: "PROFESSIONAL",
                    commandLevel: null,
                    capabilities: ["CITIZEN", "RESPONDER"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "APPROVED",
                    dutyStatus: "DISPATCHED",
                    activeIncidentId: "BM-INC-01",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            // Generic update attempting to clear assignment must be rejected
            await assertFails(updateDoc(doc(db, "users", assignedRespUid), {
                activeIncidentId: null,
                dutyStatus: "AVAILABLE",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", assignedRespUid));
                expect(snap.data()?.activeIncidentId).toBe("BM-INC-01");
                expect(snap.data()?.dutyStatus).toBe("DISPATCHED");
            });
        });
        // 9. Administrator cannot change responderSubtype through generic profile updates
        it("Hardening 9: Administrator cannot change responderSubtype through generic profile updates", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            await assertFails(updateDoc(doc(db, "users", responderUid), {
                responderSubtype: "PROFESSIONAL",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", responderUid));
                expect(snap.data()?.responderSubtype).toBe("VOLUNTEER");
            });
        });
        // 10. Authorized approval workflow still succeeds
        it("Hardening 10: Authorized approval workflow still succeeds", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coord02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const reviewId = `rev-h10-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);
            // 1. User profile approval transition
            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: serverTimestamp(),
                approvedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });
            // 2. Responder profile creation
            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Applicant Gamma",
                email: "applicant02@example.com",
                phoneNumber: null,
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                certifications: ["Basic First Aid"],
                skills: ["Search and Rescue"],
                updatedAt: new Date().toISOString(),
            });
            // 3. Review audit log
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Applicant Gamma",
                applicantEmail: "applicant02@example.com",
                decision: "APPROVED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: "VOLUNTEER",
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                rejectionReason: null,
                reviewerNotes: "Approved in hardening test",
                reviewedAt: serverTimestamp(),
            });

            await assertSucceeds(batch.commit());
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", applicantUid));
                expect(snap.data()?.role).toBe("RESPONDER");
                expect(snap.data()?.approvalStatus).toBe("APPROVED");
                expect(snap.data()?.capabilities).toEqual(["CITIZEN", "RESPONDER"]);
            });
        });
        // 11. Authorized rejection workflow still succeeds
        it("Hardening 11: Authorized rejection workflow still succeeds", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coord02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const reviewId = `rev-h11-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);
            // 1. User profile rejection transition
            batch.update(doc(db, "users", applicantUid), {
                role: "CITIZEN",
                responderSubtype: null,
                approvalStatus: "REJECTED",
                responderApplicationStatus: "REJECTED",
                capabilities: ["CITIZEN"],
                citizenEnrollmentStatus: "ACTIVE",
                rejectionReason: "Prerequisite first aid certification not provided",
                reviewedBy: coordUid,
                reviewedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });
            // 2. Review audit log
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Applicant Gamma",
                applicantEmail: "applicant02@example.com",
                decision: "REJECTED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: null,
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "REJECTED",
                rejectionReason: "Prerequisite first aid certification not provided",
                reviewerNotes: "Rejected in hardening test",
                reviewedAt: serverTimestamp(),
            });

            await assertSucceeds(batch.commit());
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", applicantUid));
                expect(snap.data()?.role).toBe("CITIZEN");
                expect(snap.data()?.approvalStatus).toBe("REJECTED");
                expect(snap.data()?.capabilities).toEqual(["CITIZEN"]);
            });
        });
        // 12. Authorized atomic assignment still succeeds
        it("Hardening 12: Authorized atomic assignment still succeeds", async () => {
            const incId = "BM-P02-ATOM12";
            const assignmentId = `${incId}_${responderUid}`;
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                // Set responder AVAILABLE
                await updateDoc(doc(fdb, "users", responderUid), {
                    dutyStatus: "AVAILABLE",
                    activeIncidentId: null,
                });
                // Create Incident
                await setDoc(doc(fdb, "incidents", incId), {
                    id: incId,
                    type: "Flood",
                    place: "Canal Road, Vijayawada",
                    description: "Water approaching house",
                    status: "Waiting for connection",
                    priority: "High",
                    createdBy: citizenUid,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coord02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const writeTime = new Date();
            const batch = writeBatch(db);
            batch.update(doc(db, "incidents", incId), {
                status: "In progress",
                assignedResponderId: responderUid,
                updatedAt: writeTime,
            });
            batch.update(doc(db, "users", responderUid), {
                dutyStatus: "DISPATCHED",
                activeIncidentId: incId,
                updatedAt: writeTime,
            });
            batch.set(doc(db, "incidentAssignments", assignmentId), {
                id: assignmentId,
                incidentId: incId,
                responderId: responderUid,
                status: "ACTIVE",
                assignedBy: coordUid,
                assignedAt: writeTime,
                updatedAt: writeTime,
            });
            await assertSucceeds(batch.commit());
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const incSnap = await getDoc(doc(fdb, "incidents", incId));
                const userSnap = await getDoc(doc(fdb, "users", responderUid));
                const assignSnap = await getDoc(doc(fdb, "incidentAssignments", assignmentId));
                expect(incSnap.data()?.status).toBe("In progress");
                expect(userSnap.data()?.dutyStatus).toBe("DISPATCHED");
                expect(userSnap.data()?.activeIncidentId).toBe(incId);
                expect(assignSnap.data()?.status).toBe("ACTIVE");
            });
        });
        // 13. Invalid assignment still fails without partial writes
        it("Hardening 13: Invalid assignment still fails without partial writes", async () => {
            const incId = "BM-P02-ATOM13";
            const assignmentId = `${incId}_${responderUid}`;
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await updateDoc(doc(fdb, "users", responderUid), {
                    dutyStatus: "AVAILABLE",
                    activeIncidentId: null,
                });
                await setDoc(doc(fdb, "incidents", incId), {
                    id: incId,
                    type: "Fire",
                    place: "Old Market",
                    status: "Waiting for connection",
                    priority: "Critical",
                    createdBy: citizenUid,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coord02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const batch = writeBatch(db);
            // Valid incident update
            batch.update(doc(db, "incidents", incId), {
                status: "In progress",
                assignedResponderId: responderUid,
                updatedAt: new Date(),
            });
            // Forbidden user update (illegal elevation)
            batch.update(doc(db, "users", responderUid), {
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                updatedAt: new Date(),
            });
            // Assignment record
            batch.set(doc(db, "incidentAssignments", assignmentId), {
                id: assignmentId,
                incidentId: incId,
                responderId: responderUid,
                status: "ACTIVE",
                assignedBy: coordUid,
                assignedAt: new Date(),
                updatedAt: new Date(),
            });
            await assertFails(batch.commit());
            // Verify zero partial write mutation
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const incSnap = await getDoc(doc(context.firestore(), "incidents", incId));
                const userSnap = await getDoc(doc(context.firestore(), "users", responderUid));
                const assignSnap = await getDoc(doc(context.firestore(), "incidentAssignments", assignmentId));
                expect(incSnap.data()?.status).toBe("Waiting for connection");
                expect(userSnap.data()?.role).toBe("RESPONDER");
                expect(assignSnap.exists()).toBe(false);
            });
        });
        // 14. Authorized account suspension and reactivation still succeed
        it("Hardening 14: Authorized account suspension and reactivation still succeed", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin02@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            // Suspension succeeds
            await assertSucceeds(updateDoc(doc(db, "users", citizenUid), {
                accountStatus: "SUSPENDED",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.accountStatus).toBe("SUSPENDED");
            });
            // Reactivation succeeds
            await assertSucceeds(updateDoc(doc(db, "users", citizenUid), {
                accountStatus: "ACTIVE",
                updatedAt: new Date(),
            }));
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
                expect(snap.data()?.accountStatus).toBe("ACTIVE");
            });
        });
        // 15. A suspended user remains unauthorized
        it("Hardening 15: A suspended user remains unauthorized", async () => {
            // Suspend citizen user
            await testEnv.withSecurityRulesDisabled(async (context) => {
                await updateDoc(doc(context.firestore(), "users", citizenUid), {
                    accountStatus: "SUSPENDED",
                });
            });
            const suspendedCtx = testEnv.authenticatedContext(citizenUid, {
                email: "cit02@example.com",
                email_verified: true,
                accountStatus: "SUSPENDED",
            });
            const db = suspendedCtx.firestore();
            // Attempting to read safezones or create incident as suspended user must be rejected
            await assertFails(getDoc(doc(db, "safezones", "sz-01")));
            await assertFails(setDoc(doc(db, "incidents", "BM-SUSP-REPORT"), {
                id: "BM-SUSP-REPORT",
                type: "Medical",
                place: "Downtown",
                status: "Waiting for connection",
                priority: "Critical",
                createdBy: citizenUid,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        });
    });
    describe("GIS Runtime Repair Regression Tests (GIS-RUNTIME-REPAIR-001)", () => {
        it("RR 1: allows authenticated user with email_verified: true to sync emailVerified mirror on profile lacking optional fields", async () => {
            const uid = "user-sync-email-01";
            // Seed a profile that does NOT have commandLevel, responderSubtype, or requestedRole
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Email Sync User",
                    email: "emailsync@example.com",
                    role: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: false,
                    accountStatus: "ACTIVE",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            // User with verified token
            const userCtx = testEnv.authenticatedContext(uid, {
                email: "emailsync@example.com",
                email_verified: true,
            });
            const db = userCtx.firestore();
            // Mirror update: toggle emailVerified to true with emailVerifiedAt and updatedAt
            await assertSucceeds(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }));
        });
        it("RR 2: rejects emailVerified mirror update if Auth token does NOT carry email_verified: true", async () => {
            const uid = "user-unverified-token";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Unverified Token User",
                    email: "unverified@example.com",
                    role: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: false,
                    accountStatus: "ACTIVE",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            // User whose token has email_verified: false
            const userCtx = testEnv.authenticatedContext(uid, {
                email: "unverified@example.com",
                email_verified: false,
            });
            const db = userCtx.firestore();
            // Must be rejected by rule Safeguard 4
            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: new Date(),
                updatedAt: new Date(),
            }));
        });
        it("RR 3: allows reading verified safe zones from both /safezones and /safeZones collections", async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "safezones", "sz-vja-verified"), {
                    id: "sz-vja-verified",
                    name: "IGMC Stadium Shelter",
                    verificationStatus: "VERIFIED",
                    capacity: 5000,
                    location: { latitude: 16.5062, longitude: 80.648 },
                });
                await setDoc(doc(adminDb, "safeZones", "sz-vja-verified-alias"), {
                    id: "sz-vja-verified-alias",
                    name: "Andhra Loyola Relief Hub",
                    verificationStatus: "VERIFIED",
                    capacity: 3500,
                    location: { latitude: 16.517, longitude: 80.628 },
                });
                await setDoc(doc(adminDb, "safezones", "sz-vja-provisional"), {
                    id: "sz-vja-provisional",
                    name: "Unverified Reference Point",
                    verificationStatus: "PROVISIONAL",
                    capacity: 100,
                    location: { latitude: 16.5, longitude: 80.6 },
                });
            });
            // Citizen user
            const citizenCtx = testEnv.authenticatedContext("citizen-reader", {
                email: "reader@example.com",
                email_verified: true,
            });
            const db = citizenCtx.firestore();
            // Both lowercase and camelCase collections can be read for verified records
            await assertSucceeds(getDoc(doc(db, "safezones", "sz-vja-verified")));
            await assertSucceeds(getDoc(doc(db, "safeZones", "sz-vja-verified-alias")));
            // Unverified safe zone cannot be read by citizen
            await assertFails(getDoc(doc(db, "safezones", "sz-vja-provisional")));
        });
    });

    // ===============================================================
    // SECURITY REMEDIATION: SEC-01, COMMAND AUTH & ACCOUNT STATUS
    // ===============================================================
    describe("Security Remediation: SEC-01, Command Authorization & Account Status Consistency", () => {
        const incidentId = "INC-REMED-001";

        beforeEach(async () => {
            // Seed a representative incident for operational read/write testing
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "incidents", incidentId), {
                    id: incidentId,
                    type: "Medical",
                    place: "MG Road, Vijayawada",
                    status: "In progress",
                    priority: "Critical",
                    createdBy: "creator-remed",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
        });

        // --- 1. SEC-01: Strict Email Verification ---
        it("SEC-01-A: Token email_verified: false + Profile emailVerified: true -> DENIED", async () => {
            const uid = "user-sec01-a";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "Spoofed Verified User",
                    email: "spoof-a@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true, // Profile mirror claims true
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "spoof-a@example.com",
                email_verified: false, // Token claim is false
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "incidents", incidentId)));
        });

        it("SEC-01-B: Token missing email_verified claim + Profile emailVerified: true -> DENIED", async () => {
            const uid = "user-sec01-b";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "Missing Claim User",
                    email: "missing-b@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "missing-b@example.com",
                // email_verified omitted
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "incidents", incidentId)));
        });

        it("SEC-01-C: Token email_verified: true + Profile emailVerified: false -> Dual Verification Required (DENIED)", async () => {
            const uid = "user-sec01-c";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "Verified Token User",
                    email: "verified-c@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: false, // Mirror not yet synced
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "verified-c@example.com",
                email_verified: true, // Trusted token claim is true
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "incidents", incidentId)));
        });

        it("SEC-01-D: No profile exists + Token email_verified: false -> DENIED", async () => {
            const uid = "orphan-unverified-user";
            const ctx = testEnv.authenticatedContext(uid, {
                email: "orphan@example.com",
                email_verified: false,
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "incidents", incidentId)));
        });

        // --- 2. Account Status: Canonical Firestore Authority ---
        it("ACCT-1: Active token claim + Suspended profile -> DENIED", async () => {
            const uid = "user-suspended-profile";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "Suspended User",
                    email: "suspended@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "SUSPENDED", // Canonical authority is SUSPENDED
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "suspended@example.com",
                email_verified: true,
                accountStatus: "ACTIVE", // Stale or spoofed token claim says ACTIVE
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "incidents", incidentId)));
        });

        it("ACCT-2: Suspended token claim + Active profile -> Follows Canonical Profile (ALLOWED)", async () => {
            const uid = "user-active-profile-stale-token";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "Active User",
                    email: "active@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE", // Canonical authority is ACTIVE
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "active@example.com",
                email_verified: true,
                accountStatus: "SUSPENDED", // Token claim says SUSPENDED
            });
            const db = ctx.firestore();
            await assertSucceeds(getDoc(doc(db, "incidents", incidentId)));
        });

        it("ACCT-3: Active verified user with missing accountStatus in profile -> DENIED (fails closed)", async () => {
            const uid = "user-missing-status";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "No Status User",
                    email: "nostatus@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    // accountStatus omitted
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "nostatus@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "incidents", incidentId)));
        });

        it("ACCT-4: Active verified user with unknown accountStatus in profile -> DENIED (fails closed)", async () => {
            const uid = "user-unknown-status";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "Unknown Status User",
                    email: "unknown@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "PENDING_VERIFICATION", // Unknown / non-ACTIVE
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "unknown@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "incidents", incidentId)));
        });

        // --- 3. Command Authorization: Independently Secure ---
        it("CMD-1: Unverified Command Admin token + valid Command profile -> DENIED", async () => {
            const adminUid = "cmd-admin-unverified";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", adminUid), {
                    uid: adminUid,
                    displayName: "Unverified Admin",
                    email: "admin-unverified@vmc.gov.in",
                    role: "COMMAND",
                    commandLevel: "ADMINISTRATOR",
                    capabilities: ["COMMAND"],
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(adminUid, {
                email: "admin-unverified@vmc.gov.in",
                email_verified: false, // Token unverified
            });
            const db = ctx.firestore();
            // Reading another user's profile requires isCommandUser()
            await assertFails(getDoc(doc(db, "users", "citizen-alice")));
        });

        it("CMD-2: Missing verification claim in Command Admin token -> DENIED", async () => {
            const adminUid = "cmd-admin-missing-claim";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", adminUid), {
                    uid: adminUid,
                    displayName: "Missing Claim Admin",
                    email: "admin-noclaim@vmc.gov.in",
                    role: "COMMAND",
                    commandLevel: "ADMINISTRATOR",
                    capabilities: ["COMMAND"],
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(adminUid, {
                email: "admin-noclaim@vmc.gov.in",
                // email_verified omitted
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "users", "citizen-alice")));
        });

        it("CMD-3: Verified Citizen profile attempting Command access -> DENIED", async () => {
            const citUid = "citizen-pretender";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", citUid), {
                    uid: citUid,
                    displayName: "Pretender",
                    email: "pretender@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(citUid, {
                email: "pretender@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            // Attempt Command-only read of another user's profile
            await assertFails(getDoc(doc(db, "users", "citizen-alice")));
            // Attempt Command-only create of safe zone
            await assertFails(setDoc(doc(db, "safezones", "sz-cit-attack"), {
                id: "sz-cit-attack",
                name: "Fake Safezone",
                verificationStatus: "VERIFIED",
                capacity: 100,
                location: { latitude: 16.5, longitude: 80.6 },
            }));
        });

        it("CMD-4: Verified Responder applicant attempting Command access -> DENIED", async () => {
            const respUid = "resp-applicant-attack";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", respUid), {
                    uid: respUid,
                    displayName: "Pending Responder",
                    email: "pending-resp@example.com",
                    role: "CITIZEN",
                    capabilities: [],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(respUid, {
                email: "pending-resp@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            await assertFails(getDoc(doc(db, "users", "citizen-alice")));
        });

        it("CMD-5: Verified Command Admin with valid profile -> ALLOWED for Admin operations", async () => {
            const adminUid = "cmd-admin-valid";
            const targetCitizenUid = "citizen-target-suspend";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", adminUid), {
                    uid: adminUid,
                    displayName: "Valid Administrator",
                    email: "admin-valid@vmc.gov.in",
                    role: "COMMAND",
                    commandLevel: "ADMINISTRATOR",
                    capabilities: ["COMMAND"],
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                await setDoc(doc(fdb, "users", targetCitizenUid), {
                    uid: targetCitizenUid,
                    displayName: "Citizen Target",
                    email: "target@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(adminUid, {
                email: "admin-valid@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            // Admin can read another user's profile
            await assertSucceeds(getDoc(doc(db, "users", targetCitizenUid)));
            // Admin can perform administrative accountStatus suspension
            await assertSucceeds(updateDoc(doc(db, "users", targetCitizenUid), {
                accountStatus: "SUSPENDED",
                updatedAt: new Date(),
            }));
        });

        it("CMD-6: Verified Command Operations (Coordinator) -> ALLOWED for Operations actions", async () => {
            const coordUid = "cmd-coord-valid";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", coordUid), {
                    uid: coordUid,
                    displayName: "Valid Coordinator",
                    email: "coord-valid@vmc.gov.in",
                    role: "COMMAND",
                    commandLevel: "COORDINATOR",
                    capabilities: ["COMMAND"],
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coord-valid@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            // Operations Coordinator can manage safezones (create)
            await assertSucceeds(setDoc(doc(db, "safezones", "sz-ops-coord-created"), {
                id: "sz-ops-coord-created",
                name: "Operations Relief Station",
                verificationStatus: "VERIFIED",
                capacity: 500,
                location: { latitude: 16.51, longitude: 80.64 },
            }));
        });

        it("CMD-7: Command Operations (Coordinator) attempting Admin-only actions -> DENIED", async () => {
            const coordUid = "cmd-coord-attacker";
            const targetCitizenUid = "citizen-target-admin-only";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", coordUid), {
                    uid: coordUid,
                    displayName: "Coordinator",
                    email: "coord-attacker@vmc.gov.in",
                    role: "COMMAND",
                    commandLevel: "COORDINATOR",
                    capabilities: ["COMMAND"],
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                await setDoc(doc(fdb, "users", targetCitizenUid), {
                    uid: targetCitizenUid,
                    displayName: "Citizen Target",
                    email: "target2@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coord-attacker@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            // Coordinator CANNOT suspend accounts (Admin-only action)
            await assertFails(updateDoc(doc(db, "users", targetCitizenUid), {
                accountStatus: "SUSPENDED",
                updatedAt: new Date(),
            }));
        });

        it("CMD-8: Public user attempting to create a Command profile -> DENIED", async () => {
            const uid = "public-command-attacker";
            const ctx = testEnv.authenticatedContext(uid, {
                email: "attacker@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            await assertFails(setDoc(doc(db, "users", uid), {
                uid,
                displayName: "Fake Admin",
                email: "attacker@example.com",
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                capabilities: ["COMMAND"],
                citizenEnrollmentStatus: "INACTIVE",
                responderApplicationStatus: "NOT_APPLIED",
                approvalStatus: "NOT_REQUIRED",
                accountStatus: "ACTIVE",
                emailVerified: true,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        });

        it("CMD-9: User attempting to modify their own role, commandLevel, or capabilities -> DENIED", async () => {
            const uid = "self-escalator";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "users", uid), {
                    uid,
                    displayName: "Escalator",
                    email: "escalator@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });
            const ctx = testEnv.authenticatedContext(uid, {
                email: "escalator@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            // Self-escalate to COMMAND role
            await assertFails(updateDoc(doc(db, "users", uid), {
                role: "COMMAND",
                updatedAt: new Date(),
            }));
            // Self-escalate commandLevel
            await assertFails(updateDoc(doc(db, "users", uid), {
                commandLevel: "ADMINISTRATOR",
                updatedAt: new Date(),
            }));
            // Self-grant COMMAND capability
            await assertFails(updateDoc(doc(db, "users", uid), {
                capabilities: ["CITIZEN", "COMMAND"],
                updatedAt: new Date(),
            }));
        });
    });

    // =========================================================================
    // Phase 1 Task 2: Responder Application Approval Workflow (APP-01 - APP-17)
    // =========================================================================
    describe("Phase 1 Task 2: Responder Application Approval Workflow (APP-01 - APP-17)", () => {
        const coordUid = "coord-wf-01";
        const adminUid = "admin-wf-01";
        const citizenUid = "citizen-wf-01";
        const applicantUid = "applicant-wf-01";

        beforeEach(async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const now = new Date();

                // 1. Incident Coordinator (COMMAND / COORDINATOR)
                await setDoc(doc(fdb, "users", coordUid), {
                    uid: coordUid,
                    displayName: "VMC Incident Coordinator",
                    email: "coordinator@vmc.gov.in",
                    role: "COMMAND",
                    commandLevel: "COORDINATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: now,
                    updatedAt: now,
                });

                // 2. Administrator (COMMAND / ADMINISTRATOR)
                await setDoc(doc(fdb, "users", adminUid), {
                    uid: adminUid,
                    displayName: "State Disaster Admin",
                    email: "admin@apsdma.gov.in",
                    role: "COMMAND",
                    commandLevel: "ADMINISTRATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: now,
                    updatedAt: now,
                });

                // 3. Regular Citizen (CITIZEN)
                await setDoc(doc(fdb, "users", citizenUid), {
                    uid: citizenUid,
                    displayName: "Vijayawada Citizen",
                    email: "citizen.vja@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    emailVerified: true,
                    phoneVerified: false,
                    createdAt: now,
                    updatedAt: now,
                });

                // 4. Pending Responder Applicant (Dual-capable candidate)
                await setDoc(doc(fdb, "users", applicantUid), {
                    uid: applicantUid,
                    displayName: "Pending Responder Applicant",
                    email: "applicant.vja@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    requestedRole: "RESPONDER",
                    requestedResponderSubtype: "VOLUNTEER",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    dutyStatus: null,
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
            });
        });

        it("APP-01: Valid Coordinator approves pending responder atomically -> assertSucceeds", async () => {
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app01-${applicantUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            // 1. User transition granting dual capability
            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: serverTimestamp(),
                approvedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });
            // 2. Responder profile initialization
            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Applicant",
                email: "applicant.vja@example.com",
                phoneNumber: null,
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                certifications: ["Basic First Aid"],
                skills: ["Search and Rescue"],
                updatedAt: now.toISOString(),
            });
            // 3. Append-only audit record
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Applicant",
                applicantEmail: "applicant.vja@example.com",
                decision: "APPROVED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: "VOLUNTEER",
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                rejectionReason: null,
                reviewerNotes: "Verified certifications",
                reviewedAt: serverTimestamp(),
            });

            await assertSucceeds(batch.commit());

            await testEnv.withSecurityRulesDisabled(async (context) => {
                const userSnap = await getDoc(doc(context.firestore(), "users", applicantUid));
                expect(userSnap.data()?.role).toBe("RESPONDER");
                expect(userSnap.data()?.approvalStatus).toBe("APPROVED");
                expect(userSnap.data()?.capabilities).toEqual(["CITIZEN", "RESPONDER"]);

                const profileSnap = await getDoc(doc(context.firestore(), "responderProfiles", applicantUid));
                expect(profileSnap.exists()).toBe(true);

                const reviewSnap = await getDoc(doc(context.firestore(), "responderApplicationReviews", reviewId));
                expect(reviewSnap.data()?.decision).toBe("APPROVED");
            });
        });

        it("APP-02: Valid Coordinator rejects pending responder atomically with reason -> assertSucceeds", async () => {
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app02-${applicantUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            // 1. User transition preserving citizen capability
            batch.update(doc(db, "users", applicantUid), {
                role: "CITIZEN",
                responderSubtype: null,
                approvalStatus: "REJECTED",
                responderApplicationStatus: "REJECTED",
                capabilities: ["CITIZEN"],
                citizenEnrollmentStatus: "ACTIVE",
                rejectionReason: "Prerequisite certifications expired or unverified",
                reviewedBy: coordUid,
                reviewedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });
            // 2. Append-only audit record
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Applicant",
                applicantEmail: "applicant.vja@example.com",
                decision: "REJECTED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: null,
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "REJECTED",
                rejectionReason: "Prerequisite certifications expired or unverified",
                reviewerNotes: "Failed verification audit",
                reviewedAt: serverTimestamp(),
            });

            await assertSucceeds(batch.commit());

            await testEnv.withSecurityRulesDisabled(async (context) => {
                const userSnap = await getDoc(doc(context.firestore(), "users", applicantUid));
                expect(userSnap.data()?.role).toBe("CITIZEN");
                expect(userSnap.data()?.approvalStatus).toBe("REJECTED");
                expect(userSnap.data()?.capabilities).toEqual(["CITIZEN"]);
                expect(userSnap.data()?.rejectionReason).toBe("Prerequisite certifications expired or unverified");
            });
        });

        it("APP-03: Citizen attempts approval on pending responder -> assertFails (403)", async () => {
            const ctx = testEnv.authenticatedContext(citizenUid, {
                email: "citizen.vja@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app03-${applicantUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: citizenUid,
                approvedBy: citizenUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Attacker Responder",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                reviewerUid: citizenUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-04: Applicant attempts self-approval -> assertFails (403)", async () => {
            const ctx = testEnv.authenticatedContext(applicantUid, {
                email: "applicant.vja@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app04-${applicantUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: applicantUid,
                approvedBy: applicantUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Self Approved Responder",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                reviewerUid: applicantUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-05: Coordinator submits mismatched reviewedBy != request.auth.uid -> assertFails (403)", async () => {
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app05-${applicantUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: "forged-coordinator-id", // MISMATCH
                approvedBy: coordUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Applicant",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                reviewerUid: coordUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-06: Coordinator submits future timestamp -> assertFails (403)", async () => {
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const futureTime = new Date(Date.now() + 120000); // 2 minutes in future
            const reviewId = `rev-app06-${applicantUid}-${Date.now()}`;

            const batch = writeBatch(db);
            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: futureTime,
                approvedAt: futureTime,
                lastReviewId: reviewId,
                updatedAt: futureTime,
            });
            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Applicant",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: futureTime.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                reviewerUid: coordUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: futureTime,
            });

            await assertFails(batch.commit());
        });

        it("APP-07: Coordinator attempts approval without granting dual capabilities -> assertFails (403)", async () => {
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app07-${applicantUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            // VIOLATION: Granting only ['RESPONDER'] instead of ['CITIZEN', 'RESPONDER']
            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Applicant",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                reviewerUid: coordUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-08: Coordinator attempts to grant COMMAND role or capability to applicant -> assertFails (403)", async () => {
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app08-${applicantUid}-${now.getTime()}`;

            // Attempt 1: Elevate role to COMMAND
            const batch1 = writeBatch(db);
            batch1.update(doc(db, "users", applicantUid), {
                role: "COMMAND",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                lastReviewId: reviewId,
                reviewedBy: coordUid,
                updatedAt: now,
            });
            await assertFails(batch1.commit());

            // Attempt 2: Add COMMAND capability
            const batch2 = writeBatch(db);
            batch2.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER", "COMMAND"],
                lastReviewId: reviewId,
                reviewedBy: coordUid,
                updatedAt: now,
            });
            await assertFails(batch2.commit());
        });

        it("APP-09: Coordinator attempts to approve non-pending user -> assertFails (403)", async () => {
            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app09-${citizenUid}-${now.getTime()}`;

            // citizenUid has approvalStatus: "NOT_REQUIRED"
            const batch = writeBatch(db);
            batch.update(doc(db, "users", citizenUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderProfiles", citizenUid), {
                uid: citizenUid,
                displayName: "Vijayawada Citizen",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: citizenUid,
                reviewerUid: coordUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-10: Coordinator attempts to demote or re-reject already approved responder -> assertFails (403)", async () => {
            const approvedUid = "resp-approved-already-01";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const now = new Date();
                await setDoc(doc(fdb, "users", approvedUid), {
                    uid: approvedUid,
                    displayName: "Already Approved Responder",
                    email: "already.approved@example.com",
                    role: "RESPONDER",
                    responderSubtype: "VOLUNTEER",
                    commandLevel: null,
                    capabilities: ["CITIZEN", "RESPONDER"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "APPROVED",
                    approvalStatus: "APPROVED",
                    dutyStatus: "OFF_DUTY",
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app10-${approvedUid}-${now.getTime()}`;

            // Coordinator attempts to change approvalStatus from APPROVED to REJECTED
            const batch = writeBatch(db);
            batch.update(doc(db, "users", approvedUid), {
                role: "CITIZEN",
                responderSubtype: null,
                approvalStatus: "REJECTED",
                responderApplicationStatus: "REJECTED",
                capabilities: ["CITIZEN"],
                rejectionReason: "Demoted due to inactivity",
                reviewedBy: coordUid,
                reviewedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: approvedUid,
                reviewerUid: coordUid,
                decision: "REJECTED",
                previousStatus: "APPROVED",
                newStatus: "REJECTED",
                rejectionReason: "Demoted due to inactivity",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-11: Coordinator attempts to approve suspended applicant -> assertFails (403)", async () => {
            const suspendedUid = "appl-suspended-wf-01";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const now = new Date();
                await setDoc(doc(fdb, "users", suspendedUid), {
                    uid: suspendedUid,
                    displayName: "Suspended Applicant",
                    email: "suspended@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    requestedRole: "RESPONDER",
                    requestedResponderSubtype: "VOLUNTEER",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    dutyStatus: null,
                    activeIncidentId: null,
                    accountStatus: "SUSPENDED", // SUSPENDED
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
            });

            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app11-${suspendedUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            batch.update(doc(db, "users", suspendedUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderProfiles", suspendedUid), {
                uid: suspendedUid,
                displayName: "Suspended Applicant",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: suspendedUid,
                reviewerUid: coordUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-12: Coordinator attempts to approve unverified applicant -> assertFails (403)", async () => {
            const unverifiedUid = "appl-unverified-wf-01";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const now = new Date();
                await setDoc(doc(fdb, "users", unverifiedUid), {
                    uid: unverifiedUid,
                    displayName: "Unverified Applicant",
                    email: "unverified@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    requestedRole: "RESPONDER",
                    requestedResponderSubtype: "VOLUNTEER",
                    capabilities: [],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    dutyStatus: null,
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: false, // UNVERIFIED
                    createdAt: now,
                    updatedAt: now,
                });
            });

            const ctx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = ctx.firestore();
            const now = new Date();
            const reviewId = `rev-app12-${unverifiedUid}-${now.getTime()}`;

            const batch = writeBatch(db);
            batch.update(doc(db, "users", unverifiedUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: reviewId,
                updatedAt: now,
            });
            batch.set(doc(db, "responderProfiles", unverifiedUid), {
                uid: unverifiedUid,
                displayName: "Unverified Applicant",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            });
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: unverifiedUid,
                reviewerUid: coordUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            });

            await assertFails(batch.commit());
        });

        it("APP-13: Client attempts to modify or delete audit log in responderApplicationReviews -> assertFails (403)", async () => {
            const reviewId = "rev-audit-immutable-01";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                await setDoc(doc(fdb, "responderApplicationReviews", reviewId), {
                    id: reviewId,
                    applicantUid: applicantUid,
                    reviewerUid: coordUid,
                    decision: "APPROVED",
                    previousStatus: "PENDING",
                    newStatus: "APPROVED",
                    reviewedAt: new Date(),
                });
            });

            // 1. Coordinator attempts update on audit record
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            await assertFails(updateDoc(doc(coordCtx.firestore(), "responderApplicationReviews", reviewId), {
                decision: "REJECTED",
            }));

            // 2. Coordinator attempts delete on audit record
            await assertFails(deleteDoc(doc(coordCtx.firestore(), "responderApplicationReviews", reviewId)));

            // 3. Admin attempts update on audit record
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@apsdma.gov.in",
                email_verified: true,
            });
            await assertFails(updateDoc(doc(adminCtx.firestore(), "responderApplicationReviews", reviewId), {
                decision: "REJECTED",
            }));

            // 4. Admin attempts delete on audit record
            await assertFails(deleteDoc(doc(adminCtx.firestore(), "responderApplicationReviews", reviewId)));
        });

        it("APP-14: Administrator attempts generic profile update to force approval without following coordinator approval contract -> assertFails (403)", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin@apsdma.gov.in",
                email_verified: true,
            });
            const db = adminCtx.firestore();

            // Administrator attempting generic updateDoc on approvalStatus
            await assertFails(updateDoc(doc(db, "users", applicantUid), {
                approvalStatus: "APPROVED",
                updatedAt: new Date(),
            }));
        });

        it("APP-15: Fabricated audit-only write without corresponding applicant transition -> assertFails (403)", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = coordCtx.firestore();
            const now = new Date();
            const reviewId = `rev-standalone-${applicantUid}-${now.getTime()}`;

            // Standalone write to responderApplicationReviews without user doc update in same batch
            await assertFails(setDoc(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                reviewerUid: coordUid,
                decision: "APPROVED",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                reviewedAt: now,
            }));
        });

        it("APP-16: Decision on applicant without corresponding valid audit entry in same batch -> assertFails (403)", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = coordCtx.firestore();
            const now = new Date();

            // Coordinator attempts user update with non-existent or omitted audit record
            await assertFails(updateDoc(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: now,
                approvedAt: now,
                lastReviewId: "non-existent-review-id",
                updatedAt: now,
            }));
        });

        it("APP-17: Arbitrary responderProfiles creation by Command without approval transition -> assertFails (403)", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator@vmc.gov.in",
                email_verified: true,
            });
            const db = coordCtx.firestore();
            const now = new Date();

            // Coordinator attempts arbitrary standalone responderProfiles creation
            await assertFails(setDoc(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Arbitrary Profile Creation",
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                updatedAt: now.toISOString(),
            }));
        });
    });

    // =========================================================================
    // Phase 1 Task 2: Security Remediation (REM-01 - REM-07)
    // =========================================================================
    describe("Phase 1 Task 2: Security Remediation (REM-01 - REM-07)", () => {
        const coordUid = "coord-rem-01";
        const adminUid = "admin-rem-01";
        const applicantUid = "appl-rem-01";
        const raceApplicantUid = "appl-rem-race-01";

        beforeEach(async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const fdb = context.firestore();
                const now = new Date();

                // Coordinator profile
                await setDoc(doc(fdb, "users", coordUid), {
                    uid: coordUid,
                    displayName: "Operations Coordinator",
                    email: "coordinator.rem@beaconmesh.org",
                    role: "COMMAND",
                    commandLevel: "COORDINATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });

                // Administrator profile
                await setDoc(doc(fdb, "users", adminUid), {
                    uid: adminUid,
                    displayName: "System Administrator",
                    email: "admin.rem@beaconmesh.org",
                    role: "COMMAND",
                    commandLevel: "ADMINISTRATOR",
                    capabilities: ["COMMAND"],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    approvalStatus: "NOT_REQUIRED",
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });

                // Standard Pending Applicant profile
                await setDoc(doc(fdb, "users", applicantUid), {
                    uid: applicantUid,
                    displayName: "Pending Responder Gamma",
                    email: "applicant.rem@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    requestedRole: "RESPONDER",
                    requestedResponderSubtype: "VOLUNTEER",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    dutyStatus: null,
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });

                // Race-test Pending Applicant profile
                await setDoc(doc(fdb, "users", raceApplicantUid), {
                    uid: raceApplicantUid,
                    displayName: "Race Pending Responder",
                    email: "race.applicant@example.com",
                    role: "CITIZEN",
                    commandLevel: null,
                    responderSubtype: null,
                    requestedRole: "RESPONDER",
                    requestedResponderSubtype: "VOLUNTEER",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "PENDING",
                    approvalStatus: "PENDING",
                    dutyStatus: null,
                    activeIncidentId: null,
                    accountStatus: "ACTIVE",
                    phoneVerified: false,
                    emailVerified: true,
                    createdAt: now,
                    updatedAt: now,
                });
            });
        });

        it("REM-01: Administrator can approve verified pending responder with reviewerName and reviewerDesignation -> assertSucceeds", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin.rem@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            const reviewId = `rev-rem01-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);

            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: adminUid,
                approvedBy: adminUid,
                reviewedAt: serverTimestamp(),
                approvedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });

            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Gamma",
                email: "applicant.rem@example.com",
                phoneNumber: null,
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                certifications: ["Basic First Aid"],
                skills: ["Search and Rescue"],
                updatedAt: new Date().toISOString(),
            });

            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Gamma",
                applicantEmail: "applicant.rem@example.com",
                decision: "APPROVED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: "VOLUNTEER",
                reviewerUid: adminUid,
                reviewerName: "Command Admin",
                reviewerRole: "ADMINISTRATOR",
                reviewerDesignation: "Command Administrator",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                rejectionReason: null,
                reviewerNotes: "Administrator approval with audit metadata",
                reviewedAt: serverTimestamp(),
            });

            await assertSucceeds(batch.commit());
        });

        it("REM-02: Administrator can reject verified pending responder with audit record -> assertSucceeds", async () => {
            const adminCtx = testEnv.authenticatedContext(adminUid, {
                email: "admin.rem@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
                accountStatus: "ACTIVE",
            });
            const db = adminCtx.firestore();
            const reviewId = `rev-rem02-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);

            batch.update(doc(db, "users", applicantUid), {
                role: "CITIZEN",
                responderSubtype: null,
                approvalStatus: "REJECTED",
                responderApplicationStatus: "REJECTED",
                capabilities: ["CITIZEN"],
                citizenEnrollmentStatus: "ACTIVE",
                rejectionReason: "Administrator rejection attempt",
                reviewedBy: adminUid,
                reviewedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });

            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Gamma",
                applicantEmail: "applicant.rem@example.com",
                decision: "REJECTED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: null,
                reviewerUid: adminUid,
                reviewerName: "Command Admin",
                reviewerRole: "ADMINISTRATOR",
                reviewerDesignation: "Command Administrator",
                previousStatus: "PENDING",
                newStatus: "REJECTED",
                rejectionReason: "Incomplete credentials",
                reviewerNotes: "Rejected with audit metadata",
                reviewedAt: serverTimestamp(),
            });

            await assertSucceeds(batch.commit());
        });

        it("REM-03: Coordinator attempts approval with forged reviewerRole ('ADMINISTRATOR' / 'SUPER_ADMIN') -> assertFails (403)", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator.rem@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const reviewId = `rev-rem03-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);

            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: serverTimestamp(),
                approvedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });

            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Gamma",
                email: "applicant.rem@example.com",
                phoneNumber: null,
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                certifications: ["Basic First Aid"],
                skills: ["Search and Rescue"],
                updatedAt: new Date().toISOString(),
            });

            // Forged reviewerRole != "COORDINATOR"
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Gamma",
                applicantEmail: "applicant.rem@example.com",
                decision: "APPROVED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: "VOLUNTEER",
                reviewerUid: coordUid,
                reviewerRole: "SUPER_ADMIN", // FORGED
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                rejectionReason: null,
                reviewerNotes: "Role forgery test",
                reviewedAt: serverTimestamp(),
            });

            await assertFails(batch.commit());
        });

        it("REM-04: Coordinator attempts approval with client backdated timestamp -> assertFails (403)", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator.rem@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const backdatedTime = new Date(Date.now() - 3600000); // 1 hour ago
            const reviewId = `rev-rem04-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);

            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: backdatedTime, // Backdated client timestamp
                approvedAt: backdatedTime,
                lastReviewId: reviewId,
                updatedAt: backdatedTime,
            });

            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Gamma",
                email: "applicant.rem@example.com",
                phoneNumber: null,
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                certifications: ["Basic First Aid"],
                skills: ["Search and Rescue"],
                updatedAt: new Date().toISOString(),
            });

            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Gamma",
                applicantEmail: "applicant.rem@example.com",
                decision: "APPROVED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: "VOLUNTEER",
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                rejectionReason: null,
                reviewerNotes: "Backdated review attempt",
                reviewedAt: backdatedTime, // Backdated client timestamp
            });

            await assertFails(batch.commit());
        });

        it("REM-05: Coordinator attempts approval with mismatched timestamps between user and review -> assertFails (403)", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator.rem@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const reviewId = `rev-rem05-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);

            batch.update(doc(db, "users", applicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: serverTimestamp(),
                approvedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });

            batch.set(doc(db, "responderProfiles", applicantUid), {
                uid: applicantUid,
                displayName: "Pending Responder Gamma",
                email: "applicant.rem@example.com",
                phoneNumber: null,
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                certifications: ["Basic First Aid"],
                skills: ["Search and Rescue"],
                updatedAt: new Date().toISOString(),
            });

            // Mismatched reviewedAt: review doc has fixed past date while user doc uses serverTimestamp
            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Gamma",
                applicantEmail: "applicant.rem@example.com",
                decision: "APPROVED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: "VOLUNTEER",
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                rejectionReason: null,
                reviewerNotes: "Mismatched timestamp test",
                reviewedAt: new Date(Date.now() - 10000), // MISMATCH
            });

            await assertFails(batch.commit());
        });

        it("REM-06: Coordinator attempts rejection with approvedAt timestamp -> assertFails (403)", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator.rem@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const reviewId = `rev-rem06-${applicantUid}-${Date.now()}`;
            const batch = writeBatch(db);

            batch.update(doc(db, "users", applicantUid), {
                role: "CITIZEN",
                responderSubtype: null,
                approvalStatus: "REJECTED",
                responderApplicationStatus: "REJECTED",
                capabilities: ["CITIZEN"],
                citizenEnrollmentStatus: "ACTIVE",
                rejectionReason: "Invalid application submission",
                reviewedBy: coordUid,
                approvedAt: serverTimestamp(), // FORBIDDEN ON REJECTION
                reviewedAt: serverTimestamp(),
                lastReviewId: reviewId,
                updatedAt: serverTimestamp(),
            });

            batch.set(doc(db, "responderApplicationReviews", reviewId), {
                id: reviewId,
                applicantUid: applicantUid,
                applicantName: "Pending Responder Gamma",
                applicantEmail: "applicant.rem@example.com",
                decision: "REJECTED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: null,
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "REJECTED",
                rejectionReason: "Invalid application submission",
                reviewerNotes: "Rejection with approvedAt test",
                reviewedAt: serverTimestamp(),
            });

            await assertFails(batch.commit());
        });

        it("REM-07: Concurrent approval and rejection decision race against same pending applicant -> exactly one decision wins", async () => {
            const coordCtx = testEnv.authenticatedContext(coordUid, {
                email: "coordinator.rem@beaconmesh.org",
                email_verified: true,
                role: "COMMAND",
                commandLevel: "COORDINATOR",
                accountStatus: "ACTIVE",
            });
            const db = coordCtx.firestore();
            const nowTime = Date.now();
            const approveReviewId = `rev-race-app-${raceApplicantUid}-${nowTime}`;
            const rejectReviewId = `rev-race-rej-${raceApplicantUid}-${nowTime}`;

            // Competing Batch 1: Approval
            const approveBatch = writeBatch(db);
            approveBatch.update(doc(db, "users", raceApplicantUid), {
                role: "RESPONDER",
                responderSubtype: "VOLUNTEER",
                approvalStatus: "APPROVED",
                responderApplicationStatus: "APPROVED",
                capabilities: ["CITIZEN", "RESPONDER"],
                citizenEnrollmentStatus: "ACTIVE",
                dutyStatus: "OFF_DUTY",
                activeIncidentId: null,
                reviewedBy: coordUid,
                approvedBy: coordUid,
                reviewedAt: serverTimestamp(),
                approvedAt: serverTimestamp(),
                lastReviewId: approveReviewId,
                updatedAt: serverTimestamp(),
            });
            approveBatch.set(doc(db, "responderProfiles", raceApplicantUid), {
                uid: raceApplicantUid,
                displayName: "Race Pending Responder",
                email: "race.applicant@example.com",
                phoneNumber: null,
                responderSubtype: "VOLUNTEER",
                availabilityStatus: "UNAVAILABLE",
                dutyStatus: "OFF_DUTY",
                certifications: ["Emergency First Aid"],
                skills: ["Flood Evacuation"],
                updatedAt: new Date().toISOString(),
            });
            approveBatch.set(doc(db, "responderApplicationReviews", approveReviewId), {
                id: approveReviewId,
                applicantUid: raceApplicantUid,
                applicantName: "Race Pending Responder",
                applicantEmail: "race.applicant@example.com",
                decision: "APPROVED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: "VOLUNTEER",
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "APPROVED",
                rejectionReason: null,
                reviewerNotes: "Concurrent race test approval",
                reviewedAt: serverTimestamp(),
            });

            // Competing Batch 2: Rejection
            const rejectBatch = writeBatch(db);
            rejectBatch.update(doc(db, "users", raceApplicantUid), {
                role: "CITIZEN",
                responderSubtype: null,
                approvalStatus: "REJECTED",
                responderApplicationStatus: "REJECTED",
                capabilities: ["CITIZEN"],
                citizenEnrollmentStatus: "ACTIVE",
                rejectionReason: "Competing concurrent rejection",
                reviewedBy: coordUid,
                reviewedAt: serverTimestamp(),
                lastReviewId: rejectReviewId,
                updatedAt: serverTimestamp(),
            });
            rejectBatch.set(doc(db, "responderApplicationReviews", rejectReviewId), {
                id: rejectReviewId,
                applicantUid: raceApplicantUid,
                applicantName: "Race Pending Responder",
                applicantEmail: "race.applicant@example.com",
                decision: "REJECTED",
                requestedSubtype: "VOLUNTEER",
                assignedSubtype: null,
                reviewerUid: coordUid,
                reviewerRole: "COORDINATOR",
                previousStatus: "PENDING",
                newStatus: "REJECTED",
                rejectionReason: "Competing concurrent rejection",
                reviewerNotes: "Concurrent race test rejection",
                reviewedAt: serverTimestamp(),
            });

            // Fire both commits concurrently
            const results = await Promise.allSettled([approveBatch.commit(), rejectBatch.commit()]);

            const fulfilled = results.filter((r) => r.status === "fulfilled");
            const rejected = results.filter((r) => r.status === "rejected");

            // Guarantee: Exactly one batch succeeds and exactly one batch fails closed
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);

            // Verify final state matches the winning batch
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const finalDb = context.firestore();
                const userSnap = await getDoc(doc(finalDb, "users", raceApplicantUid));
                const finalUserData = userSnap.data();

                const approveReviewSnap = await getDoc(doc(finalDb, "responderApplicationReviews", approveReviewId));
                const rejectReviewSnap = await getDoc(doc(finalDb, "responderApplicationReviews", rejectReviewId));
                const profileSnap = await getDoc(doc(finalDb, "responderProfiles", raceApplicantUid));

                if (finalUserData?.approvalStatus === "APPROVED") {
                    // Approval won the race
                    expect(finalUserData?.role).toBe("RESPONDER");
                    expect(finalUserData?.capabilities).toEqual(["CITIZEN", "RESPONDER"]);
                    expect(finalUserData?.lastReviewId).toBe(approveReviewId);
                    expect(approveReviewSnap.exists()).toBe(true);
                    expect(rejectReviewSnap.exists()).toBe(false);
                    expect(profileSnap.exists()).toBe(true);
                } else {
                    // Rejection won the race
                    expect(finalUserData?.approvalStatus).toBe("REJECTED");
                    expect(finalUserData?.role).toBe("CITIZEN");
                    expect(finalUserData?.capabilities).toEqual(["CITIZEN"]);
                    expect(finalUserData?.lastReviewId).toBe(rejectReviewId);
                    expect(rejectReviewSnap.exists()).toBe(true);
                    expect(approveReviewSnap.exists()).toBe(false);
                    expect(profileSnap.exists()).toBe(false); // No orphan profile on rejection
                }
            });
        });
    });

    describe("Task 3: Google Sign-In Existing Accounts Only Security & Data Integrity", () => {
        it("GGL-EMU-01: rejects writes to users/{uid} by unverified or unregistered Google caller attempting self-provisioning", async () => {
            const uid = "unregistered-google-user-emu01";
            const unverifiedGoogleUser = testEnv.authenticatedContext(uid, {
                email: "unreg@example.com",
                email_verified: false,
            });
            const db = unverifiedGoogleUser.firestore();
            await assertFails(setDoc(doc(db, "users", uid), {
                uid,
                email: "unreg@example.com",
                role: "CITIZEN",
                capabilities: ["CITIZEN"],
                accountStatus: "ACTIVE",
            }));
        });

        it("GGL-EMU-02: allows existing registered Google user to update legitimate fields (displayName, photoURL, lastLoginAt)", async () => {
            const uid = "registered-google-citizen-emu02";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Old Name",
                    email: "citizen.emu02@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: true,
                    accountStatus: "ACTIVE",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });

            const authedGoogleUser = testEnv.authenticatedContext(uid, {
                email: "citizen.emu02@example.com",
                email_verified: true,
            });
            const db = authedGoogleUser.firestore();
            await assertSucceeds(updateDoc(doc(db, "users", uid), {
                displayName: "New Google Name",
                photoURL: "https://example.com/photo.jpg",
                lastLoginAt: new Date(),
                updatedAt: new Date(),
            }));
        });

        it("GGL-EMU-03: blocks existing registered Google user from escalating role or commandLevel via update", async () => {
            const uid = "citizen-escalate-attempt-emu03";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Normal Citizen",
                    email: "citizen.emu03@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: true,
                    accountStatus: "ACTIVE",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });

            const authedGoogleUser = testEnv.authenticatedContext(uid, {
                email: "citizen.emu03@example.com",
                email_verified: true,
            });
            const db = authedGoogleUser.firestore();
            await assertFails(updateDoc(doc(db, "users", uid), {
                role: "COMMAND",
                commandLevel: "ADMINISTRATOR",
            }));
        });

        it("GGL-EMU-04: blocks suspended Google user from updating lastLoginAt or profile fields", async () => {
            const uid = "suspended-google-user-emu04";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Suspended User",
                    email: "suspended.emu04@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: true,
                    accountStatus: "SUSPENDED",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });

            const authedGoogleUser = testEnv.authenticatedContext(uid, {
                email: "suspended.emu04@example.com",
                email_verified: true,
            });
            const db = authedGoogleUser.firestore();
            await assertFails(updateDoc(doc(db, "users", uid), {
                lastLoginAt: new Date(),
                updatedAt: new Date(),
            }));
        });

        it("GGL-EMU-05: unregistered Google identity attempting direct incidents read is denied", async () => {
            const uid = "unregistered-google-user-05";
            const unregUser = testEnv.authenticatedContext(uid, {
                email: "unregistered.05@example.com",
                email_verified: true,
            });
            const db = unregUser.firestore();
            await assertFails(getDoc(doc(db, "incidents", "some-incident-id")));
        });

        it("GGL-EMU-06: unregistered Google identity attempting direct incidents create is denied", async () => {
            const uid = "unregistered-google-user-06";
            const unregUser = testEnv.authenticatedContext(uid, {
                email: "unregistered.06@example.com",
                email_verified: true,
            });
            const db = unregUser.firestore();
            await assertFails(setDoc(doc(db, "incidents", "inc-unreg-06"), {
                id: "inc-unreg-06",
                type: "Medical",
                place: "Downtown",
                description: "Created by unregistered Google user",
                status: "Waiting for connection",
                priority: "Critical",
                createdBy: uid,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        });

        it("GGL-EMU-07: Google-verified token with unverified BeaconMesh profile is denied reading and creating incidents", async () => {
            const uid = "google-unverified-profile-emu07";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Google Unverified Profile User",
                    email: "unverified.emu07@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: false, // Profile unverified
                    accountStatus: "ACTIVE",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });

            const authedGoogleUser = testEnv.authenticatedContext(uid, {
                email: "unverified.emu07@example.com",
                email_verified: true, // Google token is verified
            });
            const db = authedGoogleUser.firestore();

            // Direct read is denied
            await assertFails(getDoc(doc(db, "incidents", "some-incident-id")));

            // Direct create is denied
            await assertFails(setDoc(doc(db, "incidents", "inc-unverified-07"), {
                id: "inc-unverified-07",
                type: "Medical",
                place: "Downtown",
                description: "Attempted by unverified profile user",
                status: "Waiting for connection",
                priority: "Critical",
                createdBy: uid,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        });

        it("GGL-EMU-08: Google user attempting self-verification mirror manipulation is denied", async () => {
            const uid = "google-mirror-tamper-emu08";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Mirror Tamper User",
                    email: "tamper.emu08@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: false,
                    accountStatus: "ACTIVE",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });

            const authedGoogleUser = testEnv.authenticatedContext(uid, {
                email: "tamper.emu08@example.com",
                email_verified: true, // Google token is verified
            });
            const db = authedGoogleUser.firestore();

            // Self-modification of emailVerified is strictly forbidden
            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: new Date(),
                updatedAt: new Date(),
            }));
        });

        it("GGL-EMU-09: legitimate verified active Citizen with dual confirmation is allowed to read and create incidents", async () => {
            const uid = "google-legit-citizen-emu09";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const adminDb = context.firestore();
                await setDoc(doc(adminDb, "users", uid), {
                    uid,
                    displayName: "Legitimate Citizen",
                    email: "legit.emu09@example.com",
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: true, // Profile mirror verified
                    accountStatus: "ACTIVE",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                await setDoc(doc(adminDb, "incidents", "inc-legit-09"), {
                    id: "inc-legit-09",
                    type: "Medical",
                    place: "Downtown",
                    description: "Legitimate incident",
                    status: "Waiting for connection",
                    priority: "Critical",
                    createdBy: uid,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });

            const authedGoogleUser = testEnv.authenticatedContext(uid, {
                email: "legit.emu09@example.com",
                email_verified: true, // Token claim verified
            });
            const db = authedGoogleUser.firestore();

            // Read succeeds
            await assertSucceeds(getDoc(doc(db, "incidents", "inc-legit-09")));

            // Create succeeds
            await assertSucceeds(setDoc(doc(db, "incidents", "inc-legit-created-09"), {
                id: "inc-legit-created-09",
                type: "Medical",
                place: "Downtown",
                description: "Created by dual-verified citizen",
                status: "Waiting for connection",
                priority: "Critical",
                createdBy: uid,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        });
    });

    // ===============================================================
    // SEC-MIR-01: Email Verification Mirror Synchronization Tests
    // Validates isValidUserEmailVerificationUpdate rule behavior.
    // ===============================================================
    describe("SEC-MIR-01: Email verification mirror synchronization", () => {

        // Helper to seed a base unverified-mirror user document bypassing rules.
        async function seedUnverifiedMirrorUser(uid, email, overrides = {}) {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                await setDoc(doc(context.firestore(), "users", uid), {
                    uid,
                    displayName: "Test User",
                    email,
                    role: "CITIZEN",
                    capabilities: ["CITIZEN"],
                    citizenEnrollmentStatus: "ACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: false,   // mirror NOT yet synchronized
                    accountStatus: "ACTIVE",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    ...overrides,
                });
            });
        }

        it("MIR-01: verified token, mirror false → true with server timestamps — ALLOW", async () => {
            const uid = "mir-01-allow";
            await seedUnverifiedMirrorUser(uid, "mir01@example.com");

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir01@example.com",
                email_verified: true,   // Firebase token is verified
            });
            const db = ctx.firestore();

            // The rule requires emailVerifiedAt == request.time and updatedAt == request.time.
            // In the emulator, serverTimestamp() resolves to request.time.
            await assertSucceeds(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }));
        });

        it("MIR-02: unverified token attempting mirror update — DENY", async () => {
            const uid = "mir-02-deny-unverified";
            await seedUnverifiedMirrorUser(uid, "mir02@example.com");

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir02@example.com",
                email_verified: false,  // Token NOT verified
            });
            const db = ctx.firestore();

            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }));
        });

        it("MIR-03: mirror true → false reversal — DENY (monotonic enforcement)", async () => {
            const uid = "mir-03-deny-reversal";
            await seedUnverifiedMirrorUser(uid, "mir03@example.com", {
                emailVerified: true, // already true
            });

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir03@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            // Attempting to set emailVerified back to false must be denied.
            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: false,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }));
        });

        it("MIR-04: verification update with arbitrary client-supplied emailVerifiedAt timestamp — DENY", async () => {
            const uid = "mir-04-deny-arbitrary-ts";
            await seedUnverifiedMirrorUser(uid, "mir04@example.com");

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir04@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            // Client-supplied Date object instead of serverTimestamp() must be denied.
            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: new Date("2020-01-01T00:00:00Z"), // backdated
                updatedAt: new Date(),
            }));
        });

        it("MIR-05: verification + role escalation in same update — DENY", async () => {
            const uid = "mir-05-deny-role-escalation";
            await seedUnverifiedMirrorUser(uid, "mir05@example.com");

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir05@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            // diff includes 'role' which is NOT in the allowed set.
            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                role: "COMMAND",
            }));
        });

        it("MIR-06: verification + capability escalation in same update — DENY", async () => {
            const uid = "mir-06-deny-cap-escalation";
            await seedUnverifiedMirrorUser(uid, "mir06@example.com");

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir06@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            // diff includes 'capabilities' which is NOT in the allowed set.
            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                capabilities: ["CITIZEN", "RESPONDER"],
            }));
        });

        it("MIR-07: verification + accountStatus manipulation in same update — DENY", async () => {
            const uid = "mir-07-deny-status-manip";
            await seedUnverifiedMirrorUser(uid, "mir07@example.com");

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir07@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                accountStatus: "SUSPENDED",
            }));
        });

        it("MIR-08: missing user profile — DENY (rule requires userExists)", async () => {
            const uid = "mir-08-deny-no-profile";
            // Do NOT seed any document for this UID.

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir08@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            // Update on a non-existent document is treated as a create by updateDoc
            // and will fail because create requires isValidUserCreate, not the mirror rule.
            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }));
        });

        it("MIR-09: suspended account — mirror update DENY (suspended accounts cannot self-verify)", async () => {
            const uid = "mir-09-deny-suspended";
            await seedUnverifiedMirrorUser(uid, "mir09@example.com", {
                accountStatus: "SUSPENDED",
            });

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir09@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            await assertFails(updateDoc(doc(db, "users", uid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }));
        });

        it("MIR-10: normal valid Citizen self-update (non-verification fields) still works — ALLOW", async () => {
            const uid = "mir-10-citizen-self-update";
            await seedUnverifiedMirrorUser(uid, "mir10@example.com", {
                emailVerified: true, // already verified — testing self-update path is unbroken
            });

            const ctx = testEnv.authenticatedContext(uid, {
                email: "mir10@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            await assertSucceeds(updateDoc(doc(db, "users", uid), {
                displayName: "Updated Name",
                updatedAt: serverTimestamp(),
            }));
        });

        it("MIR-11: different user attempting to update another user's verification mirror — DENY", async () => {
            const targetUid = "mir-11-target";
            const attackerUid = "mir-11-attacker";
            await seedUnverifiedMirrorUser(targetUid, "mir11target@example.com");
            await seedUnverifiedMirrorUser(attackerUid, "mir11attacker@example.com", {
                emailVerified: true,
            });

            const ctx = testEnv.authenticatedContext(attackerUid, {
                email: "mir11attacker@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            // Attacker tries to update a different user's document.
            await assertFails(updateDoc(doc(db, "users", targetUid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }));
        });

        it("MIR-12: Coordinator/Admin privileges unchanged — verification rule does not alter command operations", async () => {
            // Coordinator should still be able to perform their own self-update (displayName).
            const coordinatorUid = "mir-12-coordinator";
            await testEnv.withSecurityRulesDisabled(async (context) => {
                await setDoc(doc(context.firestore(), "users", coordinatorUid), {
                    uid: coordinatorUid,
                    displayName: "Coordinator Smith",
                    email: "coordinator.mir12@example.com",
                    role: "COMMAND",
                    commandLevel: "COORDINATOR",
                    capabilities: [],
                    citizenEnrollmentStatus: "INACTIVE",
                    responderApplicationStatus: "NOT_APPLIED",
                    registrationPath: "CITIZEN",
                    approvalStatus: "NOT_REQUIRED",
                    phoneVerified: false,
                    emailVerified: true,
                    accountStatus: "ACTIVE",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            });

            const ctx = testEnv.authenticatedContext(coordinatorUid, {
                email: "coordinator.mir12@example.com",
                email_verified: true,
            });
            const db = ctx.firestore();

            // Normal self-update (display name change) for Coordinator must still succeed.
            await assertSucceeds(updateDoc(doc(db, "users", coordinatorUid), {
                displayName: "Coordinator Smith (Updated)",
                updatedAt: serverTimestamp(),
            }));

            // Coordinator cannot escalate their own commandLevel via the mirror rule.
            await assertFails(updateDoc(doc(db, "users", coordinatorUid), {
                emailVerified: true,
                emailVerifiedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                commandLevel: "ADMINISTRATOR",
            }));
        });
    });
});
