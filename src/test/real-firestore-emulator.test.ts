import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Real Firestore Emulator Security Rules & Attack Vector Audit", () => {
  let testEnv: RulesTestEnvironment;
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
      email_verified: false,
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
      emailVerified: false,
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
      email_verified: false,
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
      emailVerified: false,
      accountStatus: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await assertSucceeds(setDoc(doc(db, "users", uid), responderDoc));
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
    await assertFails(
      setDoc(doc(db, "responderLocations", uid), {
        uid,
        latitude: 16.5062,
        longitude: 80.648,
        dutyStatus: "AVAILABLE",
        activeIncidentId: null,
      }),
    );
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

    await assertFails(
      setDoc(doc(db, "responderLocations", uid), {
        uid,
        latitude: 16.5062,
        longitude: 80.648,
        dutyStatus: "AVAILABLE",
        activeIncidentId: null,
      }),
    );
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
    await assertFails(
      setDoc(doc(db, "responderLocations", uid), {
        uid,
        latitude: 16.5062,
        longitude: 80.648,
        dutyStatus: "OFF_DUTY",
        activeIncidentId: null,
      }),
    );
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
    await assertFails(
      updateDoc(doc(db, "users", uid), {
        activeIncidentId: "BM-ILLEGAL-9999",
        updatedAt: new Date(),
      }),
    );
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
    await assertFails(
      updateDoc(doc(db, "users", uid), {
        dutyStatus: "DISPATCHED",
        updatedAt: new Date(),
      }),
    );
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
    await assertFails(
      updateDoc(doc(db, "users", respUid), {
        dutyStatus: "DISPATCHED",
        activeIncidentId: "BM-2611-1234",
        updatedAt: new Date(),
      }),
    );
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
    await assertFails(
      updateDoc(doc(db, "incidentAssignments", assignmentId), {
        status: "CANCELLED",
      }),
    );
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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          role: "COMMAND",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          commandLevel: "COORDINATOR",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          role: "COMMAND",
          commandLevel: "ADMINISTRATOR",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", responderUid), {
          role: "COMMAND",
          commandLevel: "COORDINATOR",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", adminUid), {
          commandLevel: "COORDINATOR",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          role: "COMMAND",
          commandLevel: "ADMINISTRATOR",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", responderUid), {
          role: "CITIZEN",
          capabilities: ["CITIZEN"],
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          displayName: "Hacked Name",
          updatedAt: new Date(),
        }),
      );

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
      await assertSucceeds(
        updateDoc(doc(db, "users", citizenUid), {
          accountStatus: "SUSPENDED",
          updatedAt: new Date(),
        }),
      );

      // Administrator updating profile display name and phone
      await assertSucceeds(
        updateDoc(doc(db, "users", responderUid), {
          displayName: "Promoted Field Lead",
          phoneNumber: "+91 9876543210",
          updatedAt: new Date(),
        }),
      );

      // Phase 0.2: Administrator cannot modify responderSubtype via generic admin update
      await assertFails(
        updateDoc(doc(db, "users", responderUid), {
          responderSubtype: "PROFESSIONAL",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          capabilities: ["CITIZEN", "COMMAND"],
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          capabilities: ["CITIZEN", "RESPONDER"],
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", applicantUid), {
          approvalStatus: "APPROVED",
          updatedAt: new Date(),
        }),
      );

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
      await assertFails(
        updateDoc(doc(db, "users", unverifiedUid), {
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
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", citizenUid), {
          role: "RESPONDER",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", responderUid), {
          dutyStatus: "DISPATCHED",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", responderUid), {
          activeIncidentId: "BM-ROGUE-999",
          updatedAt: new Date(),
        }),
      );

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
      await assertFails(
        updateDoc(doc(db, "users", assignedRespUid), {
          activeIncidentId: null,
          dutyStatus: "AVAILABLE",
          updatedAt: new Date(),
        }),
      );

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

      await assertFails(
        updateDoc(doc(db, "users", responderUid), {
          responderSubtype: "PROFESSIONAL",
          updatedAt: new Date(),
        }),
      );

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

      const approvalTime = new Date();

      // Lawful approval via isValidUserCoordinatorUpdate path
      await assertSucceeds(
        updateDoc(doc(db, "users", applicantUid), {
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
          reviewedAt: approvalTime,
          approvedAt: approvalTime,
          updatedAt: approvalTime,
        }),
      );

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

      const rejectTime = new Date();

      // Lawful rejection via isValidUserCoordinatorUpdate path (preserves Citizen capability)
      await assertSucceeds(
        updateDoc(doc(db, "users", applicantUid), {
          role: "CITIZEN",
          responderSubtype: null,
          approvalStatus: "REJECTED",
          responderApplicationStatus: "REJECTED",
          capabilities: ["CITIZEN"],
          citizenEnrollmentStatus: "ACTIVE",
          rejectionReason: "Prerequisite first aid certification not provided",
          reviewedBy: coordUid,
          reviewedAt: rejectTime,
          updatedAt: rejectTime,
        }),
      );

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
      await assertSucceeds(
        updateDoc(doc(db, "users", citizenUid), {
          accountStatus: "SUSPENDED",
          updatedAt: new Date(),
        }),
      );

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const snap = await getDoc(doc(context.firestore(), "users", citizenUid));
        expect(snap.data()?.accountStatus).toBe("SUSPENDED");
      });

      // Reactivation succeeds
      await assertSucceeds(
        updateDoc(doc(db, "users", citizenUid), {
          accountStatus: "ACTIVE",
          updatedAt: new Date(),
        }),
      );

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
      await assertFails(
        setDoc(doc(db, "incidents", "BM-SUSP-REPORT"), {
          id: "BM-SUSP-REPORT",
          type: "Medical",
          place: "Downtown",
          status: "Waiting for connection",
          priority: "Critical",
          createdBy: citizenUid,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
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
      await assertSucceeds(
        updateDoc(doc(db, "users", uid), {
          emailVerified: true,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        }),
      );
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
      await assertFails(
        updateDoc(doc(db, "users", uid), {
          emailVerified: true,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        }),
      );
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
});
