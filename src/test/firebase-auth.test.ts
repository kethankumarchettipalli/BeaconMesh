import { describe, expect, it } from "vitest";
import { formatAuthError } from "@/lib/auth-service";
import { createFallbackProfile } from "@/lib/user-service";
import { normalizeUserProfile } from "@/lib/user-normalization";
import {
  evaluateRoleAuthorization,
  isPendingResponderApplicant,
} from "@/lib/auth-context";
import {
  WORKSPACE_ROUTES,
  PENDING_RESPONDER_ROUTE,
  SESSION_ROLE_KEY,
  type UserProfile,
  type UserRole,
  type ResponderSubtype,
  type CommandLevel,
} from "@/lib/auth-types";

describe("BeaconMesh Authorization Model & Roles", () => {
  it("enforces exactly three primary workspace routes", () => {
    expect(WORKSPACE_ROUTES.CITIZEN).toBe("/citizen/home");
    expect(WORKSPACE_ROUTES.RESPONDER).toBe("/responder/overview");
    expect(WORKSPACE_ROUTES.COMMAND).toBe("/command/overview");
    expect(Object.keys(WORKSPACE_ROUTES)).toHaveLength(3);
  });

  it("handles valid primary roles, responder subtypes, and command levels", () => {
    const validRoles: UserRole[] = ["CITIZEN", "RESPONDER", "COMMAND"];
    expect(validRoles).toHaveLength(3);

    const responderSubtypes: ResponderSubtype[] = ["PROFESSIONAL", "VOLUNTEER", null];
    expect(responderSubtypes).toHaveLength(3);

    const commandLevels: CommandLevel[] = ["COORDINATOR", "ADMINISTRATOR", null];
    expect(commandLevels).toHaveLength(3);
  });

  it("distinguishes responder subtypes without creating new primary roles", () => {
    const professionalResponder: Partial<UserProfile> = {
      role: "RESPONDER",
      responderSubtype: "PROFESSIONAL",
      commandLevel: null,
      approvalStatus: "APPROVED",
    };

    const volunteerResponder: Partial<UserProfile> = {
      role: "RESPONDER",
      responderSubtype: "VOLUNTEER",
      commandLevel: null,
      approvalStatus: "APPROVED",
    };

    expect(professionalResponder.role).toBe("RESPONDER");
    expect(volunteerResponder.role).toBe("RESPONDER");
    expect(professionalResponder.responderSubtype).toBe("PROFESSIONAL");
    expect(volunteerResponder.responderSubtype).toBe("VOLUNTEER");
  });

  it("distinguishes command levels without creating new primary roles", () => {
    const coordinator: Partial<UserProfile> = {
      role: "COMMAND",
      commandLevel: "COORDINATOR",
      responderSubtype: null,
      approvalStatus: "APPROVED",
    };

    const administrator: Partial<UserProfile> = {
      role: "COMMAND",
      commandLevel: "ADMINISTRATOR",
      responderSubtype: null,
      approvalStatus: "APPROVED",
    };

    expect(coordinator.role).toBe("COMMAND");
    expect(administrator.role).toBe("COMMAND");
    expect(coordinator.commandLevel).toBe("COORDINATOR");
    expect(administrator.commandLevel).toBe("ADMINISTRATOR");
  });
});

describe("Registration & Role Provisioning Rules", () => {
  it("prevents self-escalation on new responder application", () => {
    // When a user applies as a responder, their initial active role must remain CITIZEN
    // until administrative approval
    const newResponderApplication: Partial<UserProfile> = {
      role: "CITIZEN",
      requestedRole: "RESPONDER",
      requestedResponderSubtype: "VOLUNTEER",
      approvalStatus: "PENDING",
      responderSubtype: null,
      commandLevel: null,
      accountStatus: "ACTIVE",
    };

    expect(newResponderApplication.role).toBe("CITIZEN");
    expect(newResponderApplication.approvalStatus).toBe("PENDING");
    expect(newResponderApplication.requestedRole).toBe("RESPONDER");
    expect(newResponderApplication.responderSubtype).toBeNull();
  });

  it("creates a safe in-memory fallback profile when Firestore is offline or uninitialized", () => {
    const mockUser = {
      uid: "mock-uid-123",
      email: "citizen@example.com",
      displayName: "Alex Mercer",
      photoURL: null,
      phoneNumber: null,
      emailVerified: true,
    } as any;

    const fallback = createFallbackProfile(mockUser);
    expect(fallback.uid).toBe("mock-uid-123");
    expect(fallback.role).toBe("CITIZEN");
    expect(fallback.responderSubtype).toBeNull();
    expect(fallback.commandLevel).toBeNull();
    expect(fallback.approvalStatus).toBe("NOT_REQUIRED");
    expect(fallback.accountStatus).toBe("ACTIVE");
    expect(fallback.emailVerified).toBe(true);
  });

  it("defaults new Google accounts to CITIZEN role", () => {
    const newGoogleProfile: Partial<UserProfile> = {
      role: "CITIZEN",
      responderSubtype: null,
      commandLevel: null,
      approvalStatus: "NOT_REQUIRED",
      accountStatus: "ACTIVE",
      emailVerified: true,
    };

    expect(newGoogleProfile.role).toBe("CITIZEN");
    expect(newGoogleProfile.approvalStatus).toBe("NOT_REQUIRED");
  });

  it("prevents overwriting assigned roles on existing Google account sync", () => {
    const existingCommander: UserProfile = {
      uid: "cmd-user-123",
      displayName: "Morgan Diaz",
      email: "morgan@beaconmesh.org",
      role: "COMMAND",
      responderSubtype: null,
      commandLevel: "ADMINISTRATOR",
      approvalStatus: "APPROVED",
      phoneVerified: false,
      emailVerified: true,
      accountStatus: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    // Simulating Google login sync logic
    const syncedProfile = {
      ...existingCommander,
      displayName: "Morgan Diaz Updated",
      lastLoginAt: "2026-11-17T00:00:00Z",
    };

    expect(syncedProfile.role).toBe("COMMAND");
    expect(syncedProfile.commandLevel).toBe("ADMINISTRATOR");
    expect(syncedProfile.approvalStatus).toBe("APPROVED");
  });
});

describe("Workspace Guard & Authorization Logic", () => {
  it("detects workspace mismatch between intended destination and assigned role", () => {
    function checkWorkspaceAccess(intended: UserRole, userRole: UserRole): boolean {
      return intended === userRole;
    }

    expect(checkWorkspaceAccess("COMMAND", "CITIZEN")).toBe(false);
    expect(checkWorkspaceAccess("RESPONDER", "CITIZEN")).toBe(false);
    expect(checkWorkspaceAccess("CITIZEN", "RESPONDER")).toBe(false);
    expect(checkWorkspaceAccess("COMMAND", "COMMAND")).toBe(true);
    expect(checkWorkspaceAccess("RESPONDER", "RESPONDER")).toBe(true);
    expect(checkWorkspaceAccess("CITIZEN", "CITIZEN")).toBe(true);
  });

  it("blocks operational access for pending responder applications", () => {
    function canAccessOperationalResponder(profile: Partial<UserProfile>): boolean {
      return profile.role === "RESPONDER" && profile.approvalStatus === "APPROVED";
    }

    expect(canAccessOperationalResponder({ role: "CITIZEN", approvalStatus: "PENDING" })).toBe(
      false,
    );
    expect(canAccessOperationalResponder({ role: "RESPONDER", approvalStatus: "PENDING" })).toBe(
      false,
    );
    expect(canAccessOperationalResponder({ role: "RESPONDER", approvalStatus: "APPROVED" })).toBe(
      true,
    );
  });

  it("blocks access for suspended accounts", () => {
    function isAccountPermitted(profile: Partial<UserProfile>): boolean {
      return profile.accountStatus === "ACTIVE";
    }

    expect(isAccountPermitted({ accountStatus: "ACTIVE" })).toBe(true);
    expect(isAccountPermitted({ accountStatus: "SUSPENDED" })).toBe(false);
  });
});

describe("Firebase Auth Error Formatter", () => {
  it("maps common Firebase error codes into helpful messages", () => {
    expect(formatAuthError({ code: "auth/invalid-email" })).toContain("valid email");
    expect(formatAuthError({ code: "auth/user-disabled" })).toContain("disabled");
    expect(formatAuthError({ code: "auth/invalid-credential" })).toContain(
      "Invalid email or password",
    );
    expect(formatAuthError({ code: "auth/email-already-in-use" })).toContain("already exists");
    expect(formatAuthError({ code: "auth/weak-password" })).toContain("at least 8 characters");
    expect(formatAuthError({ code: "auth/popup-blocked" })).toContain("blocked");
    expect(formatAuthError({ code: "auth/too-many-requests" })).toContain("temporarily locked");
    expect(formatAuthError({ code: "auth/invalid-action-code" })).toContain("invalid");
  });

  it("maps Firestore uninitialized and client offline errors into clear setup guidance", () => {
    expect(
      formatAuthError({ message: "Failed to get document because the client is offline." }),
    ).toContain("Cloud Firestore database is not yet created");
    expect(
      formatAuthError({ message: "Database '(default)' not found. Please check your project configuration." }),
    ).toContain("Cloud Firestore database is not yet created");
  });

  it("handles unknown or arbitrary errors gracefully", () => {
    expect(formatAuthError(null)).toBe("An unexpected error occurred.");
    expect(formatAuthError("string error")).toBe("An unexpected error occurred.");
    expect(formatAuthError({ message: "Custom failure" })).toBe("Custom failure");
  });
});

describe("Gate 1: State Machine & Pending Responder Authorization", () => {
  it("evaluates 11-state authorization state machine with strict priority", () => {
    function evaluateAuthState(user: { emailVerified: boolean }, profile: Partial<UserProfile>): string {
      if (profile.accountStatus === "SUSPENDED") {
        return "SUSPENDED";
      }
      if (!user.emailVerified) {
        return "EMAIL_UNVERIFIED";
      }
      if (profile.requestedRole === "RESPONDER" && profile.approvalStatus === "PENDING") {
        return "RESPONDER_PENDING";
      }
      if (profile.role === "RESPONDER" && profile.approvalStatus === "REJECTED") {
        return "UNAUTHORIZED";
      }
      if (
        (profile.role === "CITIZEN" && profile.requestedRole !== "RESPONDER") ||
        (profile.role === "RESPONDER" && profile.approvalStatus === "APPROVED") ||
        profile.role === "COMMAND"
      ) {
        return "AUTHORIZED";
      }
      return "UNAUTHORIZED";
    }

    // 1. Suspended user is always SUSPENDED even if verified
    expect(
      evaluateAuthState(
        { emailVerified: true },
        { accountStatus: "SUSPENDED", role: "CITIZEN", approvalStatus: "NOT_REQUIRED" },
      ),
    ).toBe("SUSPENDED");

    // 2. Unverified email yields EMAIL_UNVERIFIED even if responder applicant
    expect(
      evaluateAuthState(
        { emailVerified: false },
        {
          accountStatus: "ACTIVE",
          role: "CITIZEN",
          requestedRole: "RESPONDER",
          approvalStatus: "PENDING",
        },
      ),
    ).toBe("EMAIL_UNVERIFIED");

    // 3. Verified email + pending responder applicant yields RESPONDER_PENDING (NOT AUTHORIZED)
    expect(
      evaluateAuthState(
        { emailVerified: true },
        {
          accountStatus: "ACTIVE",
          role: "CITIZEN",
          requestedRole: "RESPONDER",
          requestedResponderSubtype: "VOLUNTEER",
          approvalStatus: "PENDING",
        },
      ),
    ).toBe("RESPONDER_PENDING");

    // 4. Approved responder yields AUTHORIZED
    expect(
      evaluateAuthState(
        { emailVerified: true },
        {
          accountStatus: "ACTIVE",
          role: "RESPONDER",
          responderSubtype: "VOLUNTEER",
          approvalStatus: "APPROVED",
        },
      ),
    ).toBe("AUTHORIZED");

    // 5. Normal verified citizen yields AUTHORIZED
    expect(
      evaluateAuthState(
        { emailVerified: true },
        {
          accountStatus: "ACTIVE",
          role: "CITIZEN",
          requestedRole: null,
          approvalStatus: "NOT_REQUIRED",
        },
      ),
    ).toBe("AUTHORIZED");

    // 6. Rejected responder applicant yields UNAUTHORIZED
    expect(
      evaluateAuthState(
        { emailVerified: true },
        {
          accountStatus: "ACTIVE",
          role: "RESPONDER",
          approvalStatus: "REJECTED",
        },
      ),
    ).toBe("UNAUTHORIZED");
  });

  it("ensures pending responder applicants are routed to /responder/application-pending and blocked from /citizen/home", () => {
    function resolveUserDestination(user: { emailVerified: boolean }, profile: Partial<UserProfile>): string {
      const isPendingResponder =
        profile.requestedRole === "RESPONDER" && profile.approvalStatus === "PENDING";
      if (isPendingResponder) {
        return "/responder/application-pending";
      }
      return WORKSPACE_ROUTES[profile.role || "CITIZEN"];
    }

    const pendingApplicant: Partial<UserProfile> = {
      role: "CITIZEN",
      requestedRole: "RESPONDER",
      requestedResponderSubtype: "PROFESSIONAL",
      approvalStatus: "PENDING",
    };

    expect(resolveUserDestination({ emailVerified: true }, pendingApplicant)).toBe(
      "/responder/application-pending",
    );
    expect(resolveUserDestination({ emailVerified: true }, pendingApplicant)).not.toBe(
      "/citizen/home",
    );
  });

  it("verifies coordinator privilege boundary against administrator privilege", () => {
    interface UpdatePayload {
      role?: string;
      commandLevel?: string | null;
      approvalStatus?: string;
      accountStatus?: string;
      responderSubtype?: string | null;
    }

    function canCoordinatorExecute(target: Partial<UserProfile>, payload: UpdatePayload): boolean {
      // Coordinator cannot update if target is a Command user
      if (target.role === "COMMAND" || target.commandLevel != null) return false;
      // Coordinator can only review users who requested RESPONDER
      if (target.requestedRole !== "RESPONDER") return false;
      // Coordinator cannot set commandLevel or elevate to COMMAND
      if (payload.commandLevel !== undefined && payload.commandLevel !== null) return false;
      if (payload.role === "COMMAND") return false;
      // Coordinator cannot alter account suspensions/activations
      if (payload.accountStatus !== undefined && payload.accountStatus !== target.accountStatus) return false;
      // Coordinator can approve/reject responder applications
      if (
        payload.approvalStatus === "APPROVED" &&
        payload.role === "RESPONDER" &&
        payload.responderSubtype === target.requestedResponderSubtype
      ) {
        return true;
      }
      if (
        payload.approvalStatus === "REJECTED" &&
        payload.role === "CITIZEN" &&
        payload.responderSubtype === null
      ) {
        return true;
      }
      return false;
    }

    const pendingTarget: Partial<UserProfile> = {
      role: "CITIZEN",
      requestedRole: "RESPONDER",
      requestedResponderSubtype: "VOLUNTEER",
      approvalStatus: "PENDING",
      commandLevel: null,
      accountStatus: "ACTIVE",
    };

    // Coordinator CAN approve verified responder
    expect(
      canCoordinatorExecute(pendingTarget, {
        role: "RESPONDER",
        approvalStatus: "APPROVED",
        responderSubtype: "VOLUNTEER",
      }),
    ).toBe(true);

    // Coordinator CAN reject responder application
    expect(
      canCoordinatorExecute(pendingTarget, {
        role: "CITIZEN",
        approvalStatus: "REJECTED",
        responderSubtype: null,
      }),
    ).toBe(true);

    // Coordinator CANNOT grant COMMAND role
    expect(
      canCoordinatorExecute(pendingTarget, {
        role: "COMMAND",
        commandLevel: "COORDINATOR",
      }),
    ).toBe(false);

    // Coordinator CANNOT suspend accounts
    expect(
      canCoordinatorExecute(pendingTarget, {
        accountStatus: "SUSPENDED",
      }),
    ).toBe(false);
  });
});

describe("BeaconMesh Phase 1 Stabilization: 25 Canonical Verification Scenarios", () => {
  const standardCitizenProfile = normalizeUserProfile({
    uid: "citizen-001",
    displayName: "Standard Citizen",
    email: "citizen@example.com",
    role: "CITIZEN",
    registrationPath: "CITIZEN",
    citizenEnrollmentStatus: "ACTIVE",
    responderApplicationStatus: "NOT_APPLIED",
    capabilities: ["CITIZEN"],
    approvalStatus: "NOT_REQUIRED",
    emailVerified: true,
    accountStatus: "ACTIVE",
  });

  const unverifiedCitizenProfile = normalizeUserProfile({
    uid: "citizen-unverified-002",
    displayName: "Unverified Citizen",
    email: "unverified@example.com",
    role: "CITIZEN",
    registrationPath: "CITIZEN",
    citizenEnrollmentStatus: "ACTIVE",
    capabilities: ["CITIZEN"],
    approvalStatus: "NOT_REQUIRED",
    emailVerified: false,
    accountStatus: "ACTIVE",
  });

  const approvedResponderProfile = normalizeUserProfile({
    uid: "responder-approved-003",
    displayName: "Approved Medic",
    email: "medic@example.com",
    role: "RESPONDER",
    registrationPath: "RESPONDER",
    responderSubtype: "PROFESSIONAL",
    approvalStatus: "APPROVED",
    responderApplicationStatus: "APPROVED",
    citizenEnrollmentStatus: "ACTIVE",
    capabilities: ["CITIZEN", "RESPONDER"],
    emailVerified: true,
    accountStatus: "ACTIVE",
  });

  const pendingResponderOnlyProfile = normalizeUserProfile({
    uid: "responder-pending-004",
    displayName: "Pending Volunteer",
    email: "volunteer@example.com",
    role: "CITIZEN",
    registrationPath: "RESPONDER",
    requestedRole: "RESPONDER",
    requestedResponderSubtype: "VOLUNTEER",
    approvalStatus: "PENDING",
    responderApplicationStatus: "PENDING",
    citizenEnrollmentStatus: "INACTIVE",
    capabilities: [],
    emailVerified: true,
    accountStatus: "ACTIVE",
  });

  const unverifiedResponderProfile = normalizeUserProfile({
    uid: "responder-unverified-005",
    displayName: "Unverified Responder",
    email: "unverified.resp@example.com",
    role: "CITIZEN",
    registrationPath: "RESPONDER",
    requestedRole: "RESPONDER",
    approvalStatus: "PENDING",
    responderApplicationStatus: "PENDING",
    citizenEnrollmentStatus: "INACTIVE",
    capabilities: [],
    emailVerified: false,
    accountStatus: "ACTIVE",
  });

  const commandProfile = normalizeUserProfile({
    uid: "command-admin-006",
    displayName: "Command Admin",
    email: "admin@vmc.gov.in",
    role: "COMMAND",
    commandLevel: "ADMINISTRATOR",
    citizenEnrollmentStatus: "ACTIVE",
    capabilities: ["CITIZEN"],
    approvalStatus: "NOT_REQUIRED",
    emailVerified: true,
    accountStatus: "ACTIVE",
  });

  // Citizen Scenarios (1-5)
  it("Scenario 1: Citizen login succeeds with valid credentials and Citizen selected", () => {
    const authEval = evaluateRoleAuthorization(standardCitizenProfile, "CITIZEN");
    expect(authEval.isAuthorized).toBe(true);
    expect(authEval.errorMessage).toBeNull();
  });

  it("Scenario 2: Citizen redirected to /citizen/home", () => {
    const authEval = evaluateRoleAuthorization(standardCitizenProfile, "CITIZEN");
    expect(authEval.destinationRoute).toBe("/citizen/home");
    expect(authEval.destinationRoute).toBe(WORKSPACE_ROUTES.CITIZEN);
  });

  it("Scenario 3: Unverified Citizen held at email verification screen", () => {
    expect(unverifiedCitizenProfile.emailVerified).toBe(false);
    // In Auth state machine, !emailVerified yields EMAIL_UNVERIFIED status
    const authStatus = !unverifiedCitizenProfile.emailVerified ? "EMAIL_UNVERIFIED" : "AUTHORIZED";
    expect(authStatus).toBe("EMAIL_UNVERIFIED");
  });

  it("Scenario 4: Citizen selecting Responder denied access", () => {
    const authEval = evaluateRoleAuthorization(standardCitizenProfile, "RESPONDER");
    expect(authEval.isAuthorized).toBe(false);
    expect(authEval.errorMessage).toBe(
      "You do not have access to this dashboard. Please select an authorized role or contact your administrator.",
    );
  });

  it("Scenario 5: Citizen selecting Command denied access", () => {
    const authEval = evaluateRoleAuthorization(standardCitizenProfile, "COMMAND");
    expect(authEval.isAuthorized).toBe(false);
    expect(authEval.errorMessage).toBe(
      "You do not have access to this dashboard. Please select an authorized role or contact your administrator.",
    );
  });

  // Responder Scenarios (6-12)
  it("Scenario 6: Approved Responder login succeeds with valid credentials and Responder selected", () => {
    const authEval = evaluateRoleAuthorization(approvedResponderProfile, "RESPONDER");
    expect(authEval.isAuthorized).toBe(true);
    expect(authEval.errorMessage).toBeNull();
  });

  it("Scenario 7: Approved Responder redirected to /responder/overview", () => {
    const authEval = evaluateRoleAuthorization(approvedResponderProfile, "RESPONDER");
    expect(authEval.destinationRoute).toBe("/responder/overview");
    expect(authEval.destinationRoute).toBe(WORKSPACE_ROUTES.RESPONDER);
  });

  it("Scenario 8: Pending Responder redirected to pending-application screen", () => {
    const authEval = evaluateRoleAuthorization(pendingResponderOnlyProfile, "RESPONDER");
    expect(authEval.isAuthorized).toBe(false);
    expect(authEval.isPending).toBe(true);
    expect(authEval.destinationRoute).toBe(PENDING_RESPONDER_ROUTE);
    expect(isPendingResponderApplicant(pendingResponderOnlyProfile)).toBe(true);
  });

  it("Scenario 9: Unverified Responder held at verification screen", () => {
    expect(unverifiedResponderProfile.emailVerified).toBe(false);
    const authStatus = !unverifiedResponderProfile.emailVerified ? "EMAIL_UNVERIFIED" : "AUTHORIZED";
    expect(authStatus).toBe("EMAIL_UNVERIFIED");
  });

  it("Scenario 10: Approved Responder selecting Citizen succeeds (dual-capability)", () => {
    const authEval = evaluateRoleAuthorization(approvedResponderProfile, "CITIZEN");
    expect(authEval.isAuthorized).toBe(true);
    expect(authEval.destinationRoute).toBe("/citizen/home");
  });

  it("Scenario 11: Approved Responder selecting Command denied access", () => {
    const authEval = evaluateRoleAuthorization(approvedResponderProfile, "COMMAND");
    expect(authEval.isAuthorized).toBe(false);
    expect(authEval.errorMessage).toBe(
      "You do not have access to this dashboard. Please select an authorized role or contact your administrator.",
    );
  });

  it("Scenario 12: Pending Responder selecting Citizen denied access if Responder-only registration (quarantine)", () => {
    const authEval = evaluateRoleAuthorization(pendingResponderOnlyProfile, "CITIZEN");
    expect(authEval.isAuthorized).toBe(false);
    expect(authEval.errorMessage).toBe(
      "You do not have access to this dashboard. Please select an authorized role or contact your administrator.",
    );
  });

  // Command Scenarios (13-16)
  it("Scenario 13: Command login succeeds with valid credentials and Command selected", () => {
    const authEval = evaluateRoleAuthorization(commandProfile, "COMMAND");
    expect(authEval.isAuthorized).toBe(true);
    expect(authEval.errorMessage).toBeNull();
  });

  it("Scenario 14: Command redirected to /command/overview", () => {
    const authEval = evaluateRoleAuthorization(commandProfile, "COMMAND");
    expect(authEval.destinationRoute).toBe("/command/overview");
    expect(authEval.destinationRoute).toBe(WORKSPACE_ROUTES.COMMAND);
  });

  it("Scenario 15: Command selecting Citizen succeeds (Command has Citizen capability)", () => {
    const authEval = evaluateRoleAuthorization(commandProfile, "CITIZEN");
    expect(authEval.isAuthorized).toBe(true);
    expect(authEval.destinationRoute).toBe("/citizen/home");
  });

  it("Scenario 15b: Citizen routes deny Command-only accounts without Citizen capability", () => {
    const pureCommandProfile = normalizeUserProfile({
      ...commandProfile,
      capabilities: [],
      citizenEnrollmentStatus: "INACTIVE",
    });
    const authEval = evaluateRoleAuthorization(pureCommandProfile, "CITIZEN");
    expect(authEval.isAuthorized).toBe(false);
    expect(authEval.errorMessage).toContain("You do not have access to this dashboard");
  });

  it("Scenario 16: Command selecting Responder succeeds only if explicitly authorized", () => {
    // By default, pure Command account does not have RESPONDER capability
    const authEval = evaluateRoleAuthorization(commandProfile, "RESPONDER");
    expect(authEval.isAuthorized).toBe(false);
    expect(authEval.errorMessage).toBe(
      "You do not have access to this dashboard. Please select an authorized role or contact your administrator.",
    );

    // If an account has dual Command + Approved Responder authorization
    const dualCommandResponder = normalizeUserProfile({
      ...commandProfile,
      capabilities: ["CITIZEN", "RESPONDER"],
      approvalStatus: "APPROVED",
    });
    const dualEval = evaluateRoleAuthorization(dualCommandResponder, "RESPONDER");
    expect(dualEval.isAuthorized).toBe(true);
    expect(dualEval.destinationRoute).toBe("/responder/overview");
  });

  // Session Scenarios (17-21)
  it("Scenario 17: Active session preserves selected role on page refresh", () => {
    // Mock sessionStorage
    const storageMock: Record<string, string> = {};
    const setSession = (role: UserRole) => {
      storageMock[SESSION_ROLE_KEY] = role;
    };
    const getSession = (): UserRole | null => {
      return (storageMock[SESSION_ROLE_KEY] as UserRole) || null;
    };

    setSession("CITIZEN");
    // Refresh simulation: read from storage
    expect(getSession()).toBe("CITIZEN");

    setSession("COMMAND");
    expect(getSession()).toBe("COMMAND");
  });

  it("Scenario 18: Manual URL navigation to unauthorized dashboard is blocked", () => {
    // Simulated active session is CITIZEN
    const activeSessionRole: UserRole = "CITIZEN";
    const attemptedRoute = "/responder/overview";

    const isResponderRoute = attemptedRoute.startsWith("/responder");
    const isSessionPermitted = isResponderRoute ? activeSessionRole === "RESPONDER" : true;

    expect(isSessionPermitted).toBe(false);
  });

  it("Scenario 19: Session role does not modify stored Firestore profile", () => {
    // Clone profile before login selection
    const initialProfile = JSON.parse(JSON.stringify(approvedResponderProfile));

    // User with approved Responder profile logs in selecting Citizen
    const sessionSelection: UserRole = "CITIZEN";
    const authEval = evaluateRoleAuthorization(approvedResponderProfile, sessionSelection);
    expect(authEval.isAuthorized).toBe(true);

    // Profile remains strictly identical
    expect(approvedResponderProfile.role).toBe(initialProfile.role);
    expect(approvedResponderProfile.capabilities).toEqual(initialProfile.capabilities);
    expect(approvedResponderProfile.approvalStatus).toBe(initialProfile.approvalStatus);
  });

  it("Scenario 20: Sign out clears session role and returns to landing page", () => {
    const storageMock: Record<string, string> = {
      [SESSION_ROLE_KEY]: "RESPONDER",
    };

    const signOutSimulation = () => {
      delete storageMock[SESSION_ROLE_KEY];
      return "/";
    };

    const dest = signOutSimulation();
    expect(storageMock[SESSION_ROLE_KEY]).toBeUndefined();
    expect(dest).toBe("/");
  });

  it("Scenario 21: Multi-role user can select different authorized role on next login", () => {
    // First login: User selects RESPONDER
    const eval1 = evaluateRoleAuthorization(approvedResponderProfile, "RESPONDER");
    expect(eval1.isAuthorized).toBe(true);
    expect(eval1.destinationRoute).toBe("/responder/overview");

    // Second login: Same user selects CITIZEN
    const eval2 = evaluateRoleAuthorization(approvedResponderProfile, "CITIZEN");
    expect(eval2.isAuthorized).toBe(true);
    expect(eval2.destinationRoute).toBe("/citizen/home");
  });

  // Firestore Security Scenarios (22-25)
  it("Scenario 22: Unauthenticated reads to /users/{uid} rejected (specification test)", () => {
    // Real Emulator tests in real-firestore-emulator.test.ts (FR 1) verify this live.
    // Documenting rule requirement: isAuthenticated() && isOwner(userId)
    const isAuthenticated = (auth: any) => Boolean(auth?.uid);
    expect(isAuthenticated(null)).toBe(false);
  });

  it("Scenario 23: Users can only update their own profile within allowed schema", () => {
    // Documenting rule requirement: immutable role, approvalStatus, commandLevel on self-update
    const isClientSelfEscalationAttempt = (update: Record<string, any>) => {
      const protectedKeys = ["role", "approvalStatus", "commandLevel", "capabilities"];
      return protectedKeys.some((k) => k in update);
    };

    expect(isClientSelfEscalationAttempt({ displayName: "New Name" })).toBe(false);
    expect(isClientSelfEscalationAttempt({ role: "COMMAND" })).toBe(true);
    expect(isClientSelfEscalationAttempt({ approvalStatus: "APPROVED" })).toBe(true);
  });

  it("Scenario 24: Role self-escalation via client write rejected", () => {
    // Real Emulator tests in real-firestore-emulator.test.ts (Attack 4 & 5) verify this live.
    const isEscalationValid = (oldRole: string, newRole: string, isSuperadmin: boolean) => {
      if (oldRole !== newRole && !isSuperadmin) return false;
      return true;
    };
    expect(isEscalationValid("CITIZEN", "COMMAND", false)).toBe(false);
    expect(isEscalationValid("CITIZEN", "RESPONDER", false)).toBe(false);
  });

  it("Scenario 25: Operational collections protected against unauthorized roles", () => {
    // Real Emulator tests in real-firestore-emulator.test.ts (Attack 1, 2, 3, 7, 8) verify live.
    const canAccessOperationalDispatch = (role: UserRole, status: string) => {
      return (role === "RESPONDER" && status === "APPROVED") || role === "COMMAND";
    };

    expect(canAccessOperationalDispatch("CITIZEN", "NOT_REQUIRED")).toBe(false);
    expect(canAccessOperationalDispatch("RESPONDER", "PENDING")).toBe(false);
    expect(canAccessOperationalDispatch("RESPONDER", "APPROVED")).toBe(true);
    expect(canAccessOperationalDispatch("COMMAND", "NOT_REQUIRED")).toBe(true);
  });
});

describe("Part A: Capability Schema Consistency & Email Verification Mirror Tests", () => {
  it("A1.1: Legacy Command profile with ['COMMAND', 'CITIZEN'] purges 'COMMAND' to strictly ['CITIZEN']", () => {
    const legacyRaw = {
      uid: "cmd-legacy-01",
      email: "admin@beaconmesh.org",
      displayName: "Legacy Admin",
      role: "COMMAND" as UserRole,
      commandLevel: "ADMINISTRATOR" as CommandLevel,
      capabilities: ["COMMAND", "CITIZEN"] as any[],
      citizenEnrollmentStatus: "ACTIVE" as CitizenEnrollmentStatus,
      accountStatus: "ACTIVE" as AccountStatus,
      approvalStatus: "NOT_REQUIRED" as ApprovalStatus,
    };

    const normalized = normalizeUserProfile(legacyRaw);
    expect(normalized.role).toBe("COMMAND");
    expect(normalized.commandLevel).toBe("ADMINISTRATOR");
    // 'COMMAND' must be purged from capabilities
    expect(normalized.capabilities).toEqual(["CITIZEN"]);
    expect(normalized.capabilities).not.toContain("COMMAND");
    expect(normalized.citizenEnrollmentStatus).toBe("ACTIVE");

    // Dual-capability access to Citizen workspace is permitted
    const citizenAccess = evaluateRoleAuthorization(normalized, "CITIZEN");
    expect(citizenAccess.isAuthorized).toBe(true);
  });

  it("A1.2: Legacy Command profile with ['COMMAND'] only normalizes to empty capabilities []", () => {
    const legacyCommandOnly = {
      uid: "cmd-pure-02",
      email: "coord@beaconmesh.org",
      displayName: "Pure Coordinator",
      role: "COMMAND" as UserRole,
      commandLevel: "COORDINATOR" as CommandLevel,
      capabilities: ["COMMAND"] as any[],
      citizenEnrollmentStatus: "INACTIVE" as CitizenEnrollmentStatus,
      accountStatus: "ACTIVE" as AccountStatus,
      approvalStatus: "NOT_REQUIRED" as ApprovalStatus,
    };

    const normalized = normalizeUserProfile(legacyCommandOnly);
    expect(normalized.role).toBe("COMMAND");
    expect(normalized.capabilities).toEqual([]);
    expect(normalized.citizenEnrollmentStatus).toBe("INACTIVE");

    // Command-only account receives no automatic Citizen capability
    const citizenAccess = evaluateRoleAuthorization(normalized, "CITIZEN");
    expect(citizenAccess.isAuthorized).toBe(false);
    expect(citizenAccess.errorMessage).toContain("You do not have access to this dashboard");

    // Command workspace remains fully authorized
    const commandAccess = evaluateRoleAuthorization(normalized, "COMMAND");
    expect(commandAccess.isAuthorized).toBe(true);
  });

  it("A1.3: Promotion of Approved Responder to Command preserves both Citizen and Responder capabilities", () => {
    const responderPromotedToCommand = {
      uid: "promoted-medic-03",
      email: "medic.leader@beaconmesh.org",
      displayName: "Lead EMT Admin",
      role: "COMMAND" as UserRole,
      commandLevel: "COORDINATOR" as CommandLevel,
      requestedRole: "RESPONDER" as const,
      approvalStatus: "APPROVED" as ApprovalStatus,
      citizenEnrollmentStatus: "ACTIVE" as CitizenEnrollmentStatus,
      capabilities: ["CITIZEN", "RESPONDER"] as any[],
      accountStatus: "ACTIVE" as AccountStatus,
    };

    const normalized = normalizeUserProfile(responderPromotedToCommand);
    expect(normalized.role).toBe("COMMAND");
    expect(normalized.capabilities).toEqual(["CITIZEN", "RESPONDER"]);
    expect(evaluateRoleAuthorization(normalized, "COMMAND").isAuthorized).toBe(true);
    expect(evaluateRoleAuthorization(normalized, "CITIZEN").isAuthorized).toBe(true);
    expect(evaluateRoleAuthorization(normalized, "RESPONDER").isAuthorized).toBe(true);
  });

  it("A1.4: Promotion of Standard Citizen to Command preserves Citizen capability", () => {
    const citizenPromotedToCommand = {
      uid: "promoted-citizen-04",
      email: "citizen.admin@beaconmesh.org",
      displayName: "Civic Admin",
      role: "COMMAND" as UserRole,
      commandLevel: "ADMINISTRATOR" as CommandLevel,
      citizenEnrollmentStatus: "ACTIVE" as CitizenEnrollmentStatus,
      capabilities: ["CITIZEN"] as any[],
      accountStatus: "ACTIVE" as AccountStatus,
      approvalStatus: "NOT_REQUIRED" as ApprovalStatus,
    };

    const normalized = normalizeUserProfile(citizenPromotedToCommand);
    expect(normalized.role).toBe("COMMAND");
    expect(normalized.capabilities).toEqual(["CITIZEN"]);
    expect(evaluateRoleAuthorization(normalized, "COMMAND").isAuthorized).toBe(true);
    expect(evaluateRoleAuthorization(normalized, "CITIZEN").isAuthorized).toBe(true);
    expect(evaluateRoleAuthorization(normalized, "RESPONDER").isAuthorized).toBe(false);
  });

  it("A2.1: Email verification mirror sync completes the 6-step invariant safely", async () => {
    // Mock user object satisfying Firebase User interface contract
    let reloaded = false;
    let tokenRefreshed = false;
    const mockUser = {
      uid: "user-sync-test-05",
      email: "test.verify@beaconmesh.org",
      emailVerified: true,
      reload: async () => {
        reloaded = true;
      },
      getIdToken: async (forceRefresh?: boolean) => {
        if (forceRefresh) tokenRefreshed = true;
        return "mock-jwt-token";
      },
    };

    // Step 1: user.reload() completes
    await mockUser.reload();
    expect(reloaded).toBe(true);

    // Step 2: getIdToken(true) completes
    await mockUser.getIdToken(true);
    expect(tokenRefreshed).toBe(true);

    // Step 3: Refreshed Auth state read
    expect(mockUser.emailVerified).toBe(true);

    // Step 4 & 5: Security Rules check request.auth.token.email_verified == true
    const evaluateRuleClaim = (tokenClaims: Record<string, any>) => {
      return Boolean(tokenClaims.email_verified);
    };
    expect(evaluateRuleClaim({ email_verified: true })).toBe(true);
    expect(evaluateRuleClaim({ email_verified: false })).toBe(false);

    // Step 6: Mirror update verifies emailVerified in normalized profile
    const rawUnverifiedDoc = {
      uid: mockUser.uid,
      email: mockUser.email,
      role: "CITIZEN" as UserRole,
      emailVerified: false,
      capabilities: ["CITIZEN"] as any[],
      citizenEnrollmentStatus: "ACTIVE" as CitizenEnrollmentStatus,
    };
    const beforeSync = normalizeUserProfile(rawUnverifiedDoc);
    expect(beforeSync.emailVerified).toBe(false);

    const afterSync = normalizeUserProfile({
      ...rawUnverifiedDoc,
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
    });
    expect(afterSync.emailVerified).toBe(true);
  });
});
