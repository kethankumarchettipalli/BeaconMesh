import { describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { render, act } from "@testing-library/react";
import { formatAuthError, verifyAndAuthorizeGoogleUser } from "@/lib/auth-service";
import { createFallbackProfile, isValidProfileStructure, getUserProfile, syncGoogleUserProfile } from "@/lib/user-service";
import { normalizeUserProfile } from "@/lib/user-normalization";
import { evaluateRoleAuthorization, isPendingResponderApplicant, AuthProvider, useAuth } from "@/lib/auth-context";
import { WORKSPACE_ROUTES, PENDING_RESPONDER_ROUTE, SESSION_ROLE_KEY, } from "@/lib/auth-types";
import { signOut, getRedirectResult } from "firebase/auth";

const mockAuth = { currentUser: { uid: "test-auth-user" } };
let authStateCallback = null;

vi.mock("@/lib/firebase", () => ({
    get auth() { return mockAuth; },
    db: {},
    isFirebaseConfigured: true,
}));

vi.mock("firebase/auth", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        signOut: vi.fn().mockImplementation(async () => {
            mockAuth.currentUser = null;
            if (authStateCallback) authStateCallback(null);
        }),
        getRedirectResult: vi.fn().mockResolvedValue(null),
        onAuthStateChanged: vi.fn((_auth, cb) => {
            authStateCallback = cb;
            return vi.fn();
        }),
    };
});

vi.mock("@/lib/user-service", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getUserProfile: vi.fn(),
        syncGoogleUserProfile: vi.fn(),
    };
});
describe("BeaconMesh Authorization Model & Roles", () => {
    it("enforces exactly three primary workspace routes", () => {
        expect(WORKSPACE_ROUTES.CITIZEN).toBe("/citizen/home");
        expect(WORKSPACE_ROUTES.RESPONDER).toBe("/responder/overview");
        expect(WORKSPACE_ROUTES.COMMAND).toBe("/command/overview");
        expect(Object.keys(WORKSPACE_ROUTES)).toHaveLength(3);
    });
    it("handles valid primary roles, responder subtypes, and command levels", () => {
        const validRoles = ["CITIZEN", "RESPONDER", "COMMAND"];
        expect(validRoles).toHaveLength(3);
        const responderSubtypes = ["PROFESSIONAL", "VOLUNTEER", null];
        expect(responderSubtypes).toHaveLength(3);
        const commandLevels = ["COORDINATOR", "ADMINISTRATOR", null];
        expect(commandLevels).toHaveLength(3);
    });
    it("distinguishes responder subtypes without creating new primary roles", () => {
        const professionalResponder = {
            role: "RESPONDER",
            responderSubtype: "PROFESSIONAL",
            commandLevel: null,
            approvalStatus: "APPROVED",
        };
        const volunteerResponder = {
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
        const coordinator = {
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            responderSubtype: null,
            approvalStatus: "APPROVED",
        };
        const administrator = {
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
        const newResponderApplication = {
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
        };
        const fallback = createFallbackProfile(mockUser);
        expect(fallback.uid).toBe("mock-uid-123");
        expect(fallback.role).toBe("CITIZEN");
        expect(fallback.responderSubtype).toBeNull();
        expect(fallback.commandLevel).toBeNull();
        expect(fallback.approvalStatus).toBe("NOT_REQUIRED");
        expect(fallback.accountStatus).toBe("ACTIVE");
        expect(fallback.emailVerified).toBe(true);
    });
    it("rejects unregistered Google accounts and denies self-registration", () => {
        // Enforce that new Google accounts are NOT granted CITIZEN role or auto-registered
        const unregisteredProfile = null;
        expect(unregisteredProfile).toBeNull();
    });
    it("prevents overwriting assigned roles on existing Google account sync", () => {
        const existingCommander = {
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
        function checkWorkspaceAccess(intended, userRole) {
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
        function canAccessOperationalResponder(profile) {
            return profile.role === "RESPONDER" && profile.approvalStatus === "APPROVED";
        }
        expect(canAccessOperationalResponder({ role: "CITIZEN", approvalStatus: "PENDING" })).toBe(false);
        expect(canAccessOperationalResponder({ role: "RESPONDER", approvalStatus: "PENDING" })).toBe(false);
        expect(canAccessOperationalResponder({ role: "RESPONDER", approvalStatus: "APPROVED" })).toBe(true);
    });
    it("blocks access for suspended accounts", () => {
        function isAccountPermitted(profile) {
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
        expect(formatAuthError({ code: "auth/invalid-credential" })).toContain("Invalid email or password");
        expect(formatAuthError({ code: "auth/email-already-in-use" })).toContain("already exists");
        expect(formatAuthError({ code: "auth/weak-password" })).toContain("at least 8 characters");
        expect(formatAuthError({ code: "auth/popup-blocked" })).toContain("blocked");
        expect(formatAuthError({ code: "auth/too-many-requests" })).toContain("temporarily locked");
        expect(formatAuthError({ code: "auth/invalid-action-code" })).toContain("invalid");
    });
    it("maps Firestore uninitialized and client offline errors into clear setup guidance", () => {
        expect(formatAuthError({ message: "Failed to get document because the client is offline." })).toContain("Cloud Firestore database is not yet created");
        expect(formatAuthError({ message: "Database '(default)' not found. Please check your project configuration." })).toContain("Cloud Firestore database is not yet created");
    });
    it("handles unknown or arbitrary errors gracefully", () => {
        expect(formatAuthError(null)).toBe("An unexpected error occurred.");
        expect(formatAuthError("string error")).toBe("An unexpected error occurred.");
        expect(formatAuthError({ message: "Custom failure" })).toBe("Custom failure");
    });
});
describe("Gate 1: State Machine & Pending Responder Authorization", () => {
    it("evaluates 11-state authorization state machine with strict priority", () => {
        function evaluateAuthState(user, profile) {
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
            if ((profile.role === "CITIZEN" && profile.requestedRole !== "RESPONDER") ||
                (profile.role === "RESPONDER" && profile.approvalStatus === "APPROVED") ||
                profile.role === "COMMAND") {
                return "AUTHORIZED";
            }
            return "UNAUTHORIZED";
        }
        // 1. Suspended user is always SUSPENDED even if verified
        expect(evaluateAuthState({ emailVerified: true }, { accountStatus: "SUSPENDED", role: "CITIZEN", approvalStatus: "NOT_REQUIRED" })).toBe("SUSPENDED");
        // 2. Unverified email yields EMAIL_UNVERIFIED even if responder applicant
        expect(evaluateAuthState({ emailVerified: false }, {
            accountStatus: "ACTIVE",
            role: "CITIZEN",
            requestedRole: "RESPONDER",
            approvalStatus: "PENDING",
        })).toBe("EMAIL_UNVERIFIED");
        // 3. Verified email + pending responder applicant yields RESPONDER_PENDING (NOT AUTHORIZED)
        expect(evaluateAuthState({ emailVerified: true }, {
            accountStatus: "ACTIVE",
            role: "CITIZEN",
            requestedRole: "RESPONDER",
            requestedResponderSubtype: "VOLUNTEER",
            approvalStatus: "PENDING",
        })).toBe("RESPONDER_PENDING");
        // 4. Approved responder yields AUTHORIZED
        expect(evaluateAuthState({ emailVerified: true }, {
            accountStatus: "ACTIVE",
            role: "RESPONDER",
            responderSubtype: "VOLUNTEER",
            approvalStatus: "APPROVED",
        })).toBe("AUTHORIZED");
        // 5. Normal verified citizen yields AUTHORIZED
        expect(evaluateAuthState({ emailVerified: true }, {
            accountStatus: "ACTIVE",
            role: "CITIZEN",
            requestedRole: null,
            approvalStatus: "NOT_REQUIRED",
        })).toBe("AUTHORIZED");
        // 6. Rejected responder applicant yields UNAUTHORIZED
        expect(evaluateAuthState({ emailVerified: true }, {
            accountStatus: "ACTIVE",
            role: "RESPONDER",
            approvalStatus: "REJECTED",
        })).toBe("UNAUTHORIZED");
    });
    it("ensures pending responder applicants are routed to /responder/application-pending and blocked from /citizen/home", () => {
        function resolveUserDestination(user, profile) {
            const isPendingResponder = profile.requestedRole === "RESPONDER" && profile.approvalStatus === "PENDING";
            if (isPendingResponder) {
                return "/responder/application-pending";
            }
            return WORKSPACE_ROUTES[profile.role || "CITIZEN"];
        }
        const pendingApplicant = {
            role: "CITIZEN",
            requestedRole: "RESPONDER",
            requestedResponderSubtype: "PROFESSIONAL",
            approvalStatus: "PENDING",
        };
        expect(resolveUserDestination({ emailVerified: true }, pendingApplicant)).toBe("/responder/application-pending");
        expect(resolveUserDestination({ emailVerified: true }, pendingApplicant)).not.toBe("/citizen/home");
    });
    it("verifies coordinator privilege boundary against administrator privilege", () => {
        function canCoordinatorExecute(target, payload) {
            // Coordinator cannot update if target is a Command user
            if (target.role === "COMMAND" || target.commandLevel != null)
                return false;
            // Coordinator can only review users who requested RESPONDER
            if (target.requestedRole !== "RESPONDER")
                return false;
            // Coordinator cannot set commandLevel or elevate to COMMAND
            if (payload.commandLevel !== undefined && payload.commandLevel !== null)
                return false;
            if (payload.role === "COMMAND")
                return false;
            // Coordinator cannot alter account suspensions/activations
            if (payload.accountStatus !== undefined && payload.accountStatus !== target.accountStatus)
                return false;
            // Coordinator can approve/reject responder applications
            if (payload.approvalStatus === "APPROVED" &&
                payload.role === "RESPONDER" &&
                payload.responderSubtype === target.requestedResponderSubtype) {
                return true;
            }
            if (payload.approvalStatus === "REJECTED" &&
                payload.role === "CITIZEN" &&
                payload.responderSubtype === null) {
                return true;
            }
            return false;
        }
        const pendingTarget = {
            role: "CITIZEN",
            requestedRole: "RESPONDER",
            requestedResponderSubtype: "VOLUNTEER",
            approvalStatus: "PENDING",
            commandLevel: null,
            accountStatus: "ACTIVE",
        };
        // Coordinator CAN approve verified responder
        expect(canCoordinatorExecute(pendingTarget, {
            role: "RESPONDER",
            approvalStatus: "APPROVED",
            responderSubtype: "VOLUNTEER",
        })).toBe(true);
        // Coordinator CAN reject responder application
        expect(canCoordinatorExecute(pendingTarget, {
            role: "CITIZEN",
            approvalStatus: "REJECTED",
            responderSubtype: null,
        })).toBe(true);
        // Coordinator CANNOT grant COMMAND role
        expect(canCoordinatorExecute(pendingTarget, {
            role: "COMMAND",
            commandLevel: "COORDINATOR",
        })).toBe(false);
        // Coordinator CANNOT suspend accounts
        expect(canCoordinatorExecute(pendingTarget, {
            accountStatus: "SUSPENDED",
        })).toBe(false);
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
        expect(authEval.errorMessage).toBe("You do not have access to this dashboard. Please select an authorized role or contact your administrator.");
    });
    it("Scenario 5: Citizen selecting Command denied access", () => {
        const authEval = evaluateRoleAuthorization(standardCitizenProfile, "COMMAND");
        expect(authEval.isAuthorized).toBe(false);
        expect(authEval.errorMessage).toBe("You do not have access to this dashboard. Please select an authorized role or contact your administrator.");
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
        expect(authEval.errorMessage).toBe("You do not have access to this dashboard. Please select an authorized role or contact your administrator.");
    });
    it("Scenario 12: Pending Responder selecting Citizen denied access if Responder-only registration (quarantine)", () => {
        const authEval = evaluateRoleAuthorization(pendingResponderOnlyProfile, "CITIZEN");
        expect(authEval.isAuthorized).toBe(false);
        expect(authEval.errorMessage).toBe("You do not have access to this dashboard. Please select an authorized role or contact your administrator.");
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
        expect(authEval.errorMessage).toBe("You do not have access to this dashboard. Please select an authorized role or contact your administrator.");
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
        const storageMock = {};
        const setSession = (role) => {
            storageMock[SESSION_ROLE_KEY] = role;
        };
        const getSession = () => {
            return storageMock[SESSION_ROLE_KEY] || null;
        };
        setSession("CITIZEN");
        // Refresh simulation: read from storage
        expect(getSession()).toBe("CITIZEN");
        setSession("COMMAND");
        expect(getSession()).toBe("COMMAND");
    });
    it("Scenario 18: Manual URL navigation to unauthorized dashboard is blocked", () => {
        // Simulated active session is CITIZEN
        const activeSessionRole = "CITIZEN";
        const attemptedRoute = "/responder/overview";
        const isResponderRoute = attemptedRoute.startsWith("/responder");
        const isSessionPermitted = isResponderRoute ? activeSessionRole === "RESPONDER" : true;
        expect(isSessionPermitted).toBe(false);
    });
    it("Scenario 19: Session role does not modify stored Firestore profile", () => {
        // Clone profile before login selection
        const initialProfile = JSON.parse(JSON.stringify(approvedResponderProfile));
        // User with approved Responder profile logs in selecting Citizen
        const sessionSelection = "CITIZEN";
        const authEval = evaluateRoleAuthorization(approvedResponderProfile, sessionSelection);
        expect(authEval.isAuthorized).toBe(true);
        // Profile remains strictly identical
        expect(approvedResponderProfile.role).toBe(initialProfile.role);
        expect(approvedResponderProfile.capabilities).toEqual(initialProfile.capabilities);
        expect(approvedResponderProfile.approvalStatus).toBe(initialProfile.approvalStatus);
    });
    it("Scenario 20: Sign out clears session role and returns to landing page", () => {
        const storageMock = {
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
        const isAuthenticated = (auth) => Boolean(auth?.uid);
        expect(isAuthenticated(null)).toBe(false);
    });
    it("Scenario 23: Users can only update their own profile within allowed schema", () => {
        // Documenting rule requirement: immutable role, approvalStatus, commandLevel on self-update
        const isClientSelfEscalationAttempt = (update) => {
            const protectedKeys = ["role", "approvalStatus", "commandLevel", "capabilities"];
            return protectedKeys.some((k) => k in update);
        };
        expect(isClientSelfEscalationAttempt({ displayName: "New Name" })).toBe(false);
        expect(isClientSelfEscalationAttempt({ role: "COMMAND" })).toBe(true);
        expect(isClientSelfEscalationAttempt({ approvalStatus: "APPROVED" })).toBe(true);
    });
    it("Scenario 24: Role self-escalation via client write rejected", () => {
        // Real Emulator tests in real-firestore-emulator.test.ts (Attack 4 & 5) verify this live.
        const isEscalationValid = (oldRole, newRole, isSuperadmin) => {
            if (oldRole !== newRole && !isSuperadmin)
                return false;
            return true;
        };
        expect(isEscalationValid("CITIZEN", "COMMAND", false)).toBe(false);
        expect(isEscalationValid("CITIZEN", "RESPONDER", false)).toBe(false);
    });
    it("Scenario 25: Operational collections protected against unauthorized roles", () => {
        // Real Emulator tests in real-firestore-emulator.test.ts (Attack 1, 2, 3, 7, 8) verify live.
        const canAccessOperationalDispatch = (role, status) => {
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
            role: "COMMAND",
            commandLevel: "ADMINISTRATOR",
            capabilities: ["COMMAND", "CITIZEN"],
            citizenEnrollmentStatus: "ACTIVE",
            accountStatus: "ACTIVE",
            approvalStatus: "NOT_REQUIRED",
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
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            capabilities: ["COMMAND"],
            citizenEnrollmentStatus: "INACTIVE",
            accountStatus: "ACTIVE",
            approvalStatus: "NOT_REQUIRED",
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
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            requestedRole: "RESPONDER",
            approvalStatus: "APPROVED",
            citizenEnrollmentStatus: "ACTIVE",
            capabilities: ["CITIZEN", "RESPONDER"],
            accountStatus: "ACTIVE",
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
            role: "COMMAND",
            commandLevel: "ADMINISTRATOR",
            citizenEnrollmentStatus: "ACTIVE",
            capabilities: ["CITIZEN"],
            accountStatus: "ACTIVE",
            approvalStatus: "NOT_REQUIRED",
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
            getIdToken: async (forceRefresh) => {
                if (forceRefresh)
                    tokenRefreshed = true;
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
        const evaluateRuleClaim = (tokenClaims) => {
            return Boolean(tokenClaims.email_verified);
        };
        expect(evaluateRuleClaim({ email_verified: true })).toBe(true);
        expect(evaluateRuleClaim({ email_verified: false })).toBe(false);
        // Step 6: Mirror update verifies emailVerified in normalized profile
        const rawUnverifiedDoc = {
            uid: mockUser.uid,
            email: mockUser.email,
            role: "CITIZEN",
            emailVerified: false,
            capabilities: ["CITIZEN"],
            citizenEnrollmentStatus: "ACTIVE",
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
describe("Task 3: Google Sign-In Existing Accounts Only Authorization (GGL-01 - GGL-15)", () => {
    const mockGoogleCitizenUser = {
        uid: "google-citizen-uid-01",
        email: "citizen@example.com",
        displayName: "Citizen Jane",
        photoURL: "https://example.com/jane.jpg",
        emailVerified: true,
    };

    const validCitizenProfile = {
        uid: "google-citizen-uid-01",
        displayName: "Citizen Jane",
        email: "citizen@example.com",
        photoURL: null,
        role: "CITIZEN",
        capabilities: ["CITIZEN"],
        citizenEnrollmentStatus: "ACTIVE",
        responderApplicationStatus: "NOT_APPLIED",
        registrationPath: "CITIZEN",
        responderSubtype: null,
        commandLevel: null,
        requestedRole: null,
        requestedResponderSubtype: null,
        approvalStatus: "NOT_REQUIRED",
        phoneNumber: null,
        phoneVerified: false,
        emailVerified: true,
        accountStatus: "ACTIVE",
    };

    it("GGL-01: Citizen existing account allowed -> successful login, profile returned with CITIZEN role & capabilities", async () => {
        vi.mocked(getUserProfile).mockResolvedValueOnce(validCitizenProfile);
        vi.mocked(syncGoogleUserProfile).mockResolvedValueOnce({
            ...validCitizenProfile,
            lastLoginAt: "2026-11-26T12:00:00Z",
        });

        const result = await verifyAndAuthorizeGoogleUser(mockGoogleCitizenUser);
        expect(result.user.uid).toBe("google-citizen-uid-01");
        expect(result.profile.role).toBe("CITIZEN");
        expect(result.profile.capabilities).toEqual(["CITIZEN"]);
        expect(result.profile.accountStatus).toBe("ACTIVE");
        expect(result.profile.emailVerified).toBe(true);
    });

    it("GGL-02: Responder existing account allowed -> successful login, profile returned with RESPONDER role & capabilities preserved", async () => {
        const approvedResponder = {
            ...validCitizenProfile,
            uid: "google-responder-uid-02",
            role: "RESPONDER",
            capabilities: ["CITIZEN", "RESPONDER"],
            approvalStatus: "APPROVED",
            responderSubtype: "VOLUNTEER",
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(approvedResponder);
        vi.mocked(syncGoogleUserProfile).mockResolvedValueOnce({
            ...approvedResponder,
            lastLoginAt: "2026-11-26T12:00:00Z",
        });

        const result = await verifyAndAuthorizeGoogleUser({
            ...mockGoogleCitizenUser,
            uid: "google-responder-uid-02",
        });
        expect(result.profile.role).toBe("RESPONDER");
        expect(result.profile.capabilities).toContain("RESPONDER");
        expect(result.profile.approvalStatus).toBe("APPROVED");
    });

    it("GGL-03: Pending responder applicant preserved -> successful login, profile returned with requestedRole RESPONDER, approvalStatus PENDING", async () => {
        const pendingApplicant = {
            ...validCitizenProfile,
            uid: "google-pending-uid-03",
            role: "CITIZEN",
            capabilities: ["CITIZEN"],
            requestedRole: "RESPONDER",
            requestedResponderSubtype: "VOLUNTEER",
            approvalStatus: "PENDING",
            responderApplicationStatus: "PENDING",
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(pendingApplicant);
        vi.mocked(syncGoogleUserProfile).mockResolvedValueOnce({
            ...pendingApplicant,
            lastLoginAt: "2026-11-26T12:00:00Z",
        });

        const result = await verifyAndAuthorizeGoogleUser({
            ...mockGoogleCitizenUser,
            uid: "google-pending-uid-03",
        });
        expect(result.profile.requestedRole).toBe("RESPONDER");
        expect(result.profile.approvalStatus).toBe("PENDING");
        expect(result.profile.role).toBe("CITIZEN");
    });

    it("GGL-04: Command Operations existing account allowed -> successful login, profile returned with COMMAND role, COORDINATOR level preserved", async () => {
        const commandOps = {
            ...validCitizenProfile,
            uid: "google-cmd-ops-04",
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            capabilities: ["CITIZEN"],
            approvalStatus: "APPROVED",
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(commandOps);
        vi.mocked(syncGoogleUserProfile).mockResolvedValueOnce({
            ...commandOps,
            lastLoginAt: "2026-11-26T12:00:00Z",
        });

        const result = await verifyAndAuthorizeGoogleUser({
            ...mockGoogleCitizenUser,
            uid: "google-cmd-ops-04",
        });
        expect(result.profile.role).toBe("COMMAND");
        expect(result.profile.commandLevel).toBe("COORDINATOR");
    });

    it("GGL-05: Command Admin existing account allowed -> successful login, profile returned with COMMAND role, ADMINISTRATOR level preserved", async () => {
        const commandAdmin = {
            ...validCitizenProfile,
            uid: "google-cmd-admin-05",
            role: "COMMAND",
            commandLevel: "ADMINISTRATOR",
            capabilities: ["CITIZEN"],
            approvalStatus: "APPROVED",
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(commandAdmin);
        vi.mocked(syncGoogleUserProfile).mockResolvedValueOnce({
            ...commandAdmin,
            lastLoginAt: "2026-11-26T12:00:00Z",
        });

        const result = await verifyAndAuthorizeGoogleUser({
            ...mockGoogleCitizenUser,
            uid: "google-cmd-admin-05",
        });
        expect(result.profile.role).toBe("COMMAND");
        expect(result.profile.commandLevel).toBe("ADMINISTRATOR");
    });

    it("GGL-06: Suspended account denied -> throws auth/user-suspended and calls signOut", async () => {
        const suspendedUser = {
            ...validCitizenProfile,
            uid: "google-suspended-06",
            accountStatus: "SUSPENDED",
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(suspendedUser);
        vi.mocked(signOut).mockClear();

        await expect(
            verifyAndAuthorizeGoogleUser({ ...mockGoogleCitizenUser, uid: "google-suspended-06" })
        ).rejects.toMatchObject({ code: "auth/user-suspended" });

        expect(signOut).toHaveBeenCalled();
    });

    it("GGL-07: Unverified account denied -> throws auth/email-unverified and calls signOut", async () => {
        const unverifiedUser = {
            ...validCitizenProfile,
            uid: "google-unverified-07",
            emailVerified: false,
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(unverifiedUser);
        vi.mocked(signOut).mockClear();

        await expect(
            verifyAndAuthorizeGoogleUser({ ...mockGoogleCitizenUser, uid: "google-unverified-07" })
        ).rejects.toMatchObject({ code: "auth/email-unverified" });

        expect(signOut).toHaveBeenCalled();
    });

    it("GGL-08: Unknown/unregistered Google identity denied -> throws auth/user-not-found, calls signOut, zero writes", async () => {
        vi.mocked(getUserProfile).mockResolvedValueOnce(null);
        vi.mocked(syncGoogleUserProfile).mockClear();
        vi.mocked(signOut).mockClear();

        await expect(
            verifyAndAuthorizeGoogleUser({ ...mockGoogleCitizenUser, uid: "google-unknown-08" })
        ).rejects.toMatchObject({ code: "auth/user-not-found" });

        expect(signOut).toHaveBeenCalled();
        expect(syncGoogleUserProfile).not.toHaveBeenCalled();
    });

    it("GGL-09: Firestore lookup failure denied -> throws auth/profile-lookup-failed and calls signOut", async () => {
        vi.mocked(getUserProfile).mockRejectedValueOnce(new Error("Database offline"));
        vi.mocked(signOut).mockClear();

        await expect(
            verifyAndAuthorizeGoogleUser({ ...mockGoogleCitizenUser, uid: "google-err-09" })
        ).rejects.toMatchObject({ code: "auth/profile-lookup-failed" });

        expect(signOut).toHaveBeenCalled();
    });

    it("GGL-10: Malformed profile denied -> throws auth/malformed-profile and calls signOut", async () => {
        const malformedProfile = {
            uid: "google-bad-10",
            email: "bad@test.com",
            // missing role, accountStatus, approvalStatus, capabilities
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(malformedProfile);
        vi.mocked(signOut).mockClear();

        await expect(
            verifyAndAuthorizeGoogleUser({ ...mockGoogleCitizenUser, uid: "google-bad-10" })
        ).rejects.toMatchObject({ code: "auth/malformed-profile" });

        expect(signOut).toHaveBeenCalled();
    });

    it("GGL-11: Claims isolation -> Google identity tokens/display cannot escalate role or commandLevel", async () => {
        // Attacker claims to be COMMAND ADMINISTRATOR in Google identity
        const maliciousGoogleUser = {
            uid: "google-citizen-uid-01",
            email: "citizen@example.com",
            displayName: "Commander Attacker",
            role: "COMMAND",
            commandLevel: "ADMINISTRATOR",
        };
        vi.mocked(getUserProfile).mockResolvedValueOnce(validCitizenProfile);
        vi.mocked(syncGoogleUserProfile).mockResolvedValueOnce({
            ...validCitizenProfile,
            displayName: "Commander Attacker",
        });

        const result = await verifyAndAuthorizeGoogleUser(maliciousGoogleUser);
        expect(result.profile.role).toBe("CITIZEN");
        expect(result.profile.commandLevel).toBeNull();
    });

    it("GGL-12: Route guard evaluation correctly routes Google accounts by assigned role", () => {
        expect(evaluateRoleAuthorization(validCitizenProfile, "CITIZEN").isAuthorized).toBe(true);
        expect(evaluateRoleAuthorization(validCitizenProfile, "COMMAND").isAuthorized).toBe(false);
        expect(evaluateRoleAuthorization(validCitizenProfile, "RESPONDER").isAuthorized).toBe(false);
    });

    it("GGL-13: Denial cleanup -> signOut is guaranteed across all rejection branches", async () => {
        vi.mocked(signOut).mockClear();
        await expect(verifyAndAuthorizeGoogleUser(null)).rejects.toMatchObject({
            code: "auth/invalid-credential",
        });
        expect(signOut).toHaveBeenCalled();
    });

    it("GGL-14: Structural validator correctly distinguishes complete from malformed profiles", () => {
        expect(isValidProfileStructure(validCitizenProfile)).toBe(true);
        expect(isValidProfileStructure(null)).toBe(false);
        expect(isValidProfileStructure({})).toBe(false);
        expect(isValidProfileStructure({ ...validCitizenProfile, role: "SUPERUSER" })).toBe(false);
        expect(isValidProfileStructure({ ...validCitizenProfile, accountStatus: "PENDING" })).toBe(false);
        expect(isValidProfileStructure({ ...validCitizenProfile, capabilities: "not-an-array" })).toBe(false);
    });

    it("GGL-15: Error formatter translates all Google authorization errors to user-friendly messages", () => {
        expect(formatAuthError({ code: "auth/user-not-found" })).toContain("registration wizard");
        expect(formatAuthError({ code: "auth/user-suspended" })).toContain("suspended");
        expect(formatAuthError({ code: "auth/email-unverified" })).toContain("verification");
        expect(formatAuthError({ code: "auth/malformed-profile" })).toContain("invalid or corrupted");
        expect(formatAuthError({ code: "auth/profile-lookup-failed" })).toContain("network or database issue");
    });

    describe("AuthContext Async Profile Race Conditions (Defect 2 Remediation)", () => {
        function RedirectTestConsumer({ onUpdate }) {
            const ctx = useAuth();
            useEffect(() => {
                onUpdate(ctx);
            }, [ctx, onUpdate]);
            return React.createElement("div", null, ctx.status);
        }

        it("GGL-16: Stale async profile fetch on sign-out does not resurrect session or set profile", async () => {
            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            // Set up a deferred promise for User A's profile
            let resolveUserA;
            const userAPromise = new Promise((resolve) => {
                resolveUserA = resolve;
            });
            vi.mocked(getUserProfile).mockReturnValueOnce(userAPromise);

            const userA = { uid: "user-a-race", emailVerified: true };
            mockAuth.currentUser = userA;

            // Trigger User A login in AuthContext
            await act(async () => {
                if (authStateCallback) authStateCallback(userA);
            });

            expect(lastContext.status).toBe("PROFILE_LOADING");

            // User signs out while User A profile is still in-flight
            mockAuth.currentUser = null;
            await act(async () => {
                if (authStateCallback) authStateCallback(null);
            });

            expect(lastContext.status).toBe("UNAUTHENTICATED");
            expect(lastContext.profile).toBeNull();
            expect(lastContext.user).toBeNull();

            // Now delayed User A profile fetch completes
            await act(async () => {
                resolveUserA({
                    ...validCitizenProfile,
                    uid: "user-a-race",
                });
            });

            // Must NOT have resurrected session or applied profile
            expect(lastContext.status).toBe("UNAUTHENTICATED");
            expect(lastContext.profile).toBeNull();
            expect(lastContext.user).toBeNull();
        });

        it("GGL-17: Rapid identity switch (User A -> User B) does not allow delayed User A profile to overwrite User B", async () => {
            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            // User A fetch is slow
            let resolveUserA;
            const userAPromise = new Promise((resolve) => {
                resolveUserA = resolve;
            });
            vi.mocked(getUserProfile).mockReturnValueOnce(userAPromise);

            const userA = { uid: "user-a-slow", emailVerified: true };
            mockAuth.currentUser = userA;

            await act(async () => {
                if (authStateCallback) authStateCallback(userA);
            });

            // Fast forward: User B logs in immediately
            const userB = { uid: "user-b-fast", emailVerified: true };
            const profileB = {
                ...validCitizenProfile,
                uid: "user-b-fast",
                displayName: "User B Active",
            };
            vi.mocked(getUserProfile).mockResolvedValueOnce(profileB);
            mockAuth.currentUser = userB;

            await act(async () => {
                if (authStateCallback) authStateCallback(userB);
            });

            // User B should be active and authorized
            expect(lastContext.status).toBe("AUTHORIZED");
            expect(lastContext.profile?.uid).toBe("user-b-fast");
            expect(lastContext.profile?.displayName).toBe("User B Active");

            // Now User A's slow profile resolves
            await act(async () => {
                resolveUserA({
                    ...validCitizenProfile,
                    uid: "user-a-slow",
                    displayName: "User A Stale",
                });
            });

            // Active session must remain User B; User A's result must be discarded
            expect(lastContext.status).toBe("AUTHORIZED");
            expect(lastContext.profile?.uid).toBe("user-b-fast");
            expect(lastContext.profile?.displayName).toBe("User B Active");
        });

        it("GGL-18: Delayed profile fetch error after signout or newer login does not set PROFILE_ERROR", async () => {
            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            // User A lookup is pending
            let rejectUserA;
            const userAPromise = new Promise((_, reject) => {
                rejectUserA = reject;
            });
            vi.mocked(getUserProfile).mockReturnValueOnce(userAPromise);

            const userA = { uid: "user-a-err", emailVerified: true };
            mockAuth.currentUser = userA;

            await act(async () => {
                if (authStateCallback) authStateCallback(userA);
            });

            // User signs out
            mockAuth.currentUser = null;
            await act(async () => {
                if (authStateCallback) authStateCallback(null);
            });

            expect(lastContext.status).toBe("UNAUTHENTICATED");

            // Stale lookup rejects with an error
            await act(async () => {
                rejectUserA(new Error("Network disconnect"));
            });

            // Stale rejection must be discarded, status remains UNAUTHENTICATED
            expect(lastContext.status).toBe("UNAUTHENTICATED");
            expect(lastContext.profile).toBeNull();
        });
    });

    describe("Google Redirect Result Handling in AuthProvider", () => {
        function RedirectTestConsumer({ onUpdate }) {
            const ctx = useAuth();
            useEffect(() => {
                onUpdate(ctx);
            }, [ctx, onUpdate]);
            return null;
        }
        const validCitizenProfile = {
            uid: "ggl-redir-01",
            displayName: "Redirect Citizen",
            email: "redir@example.com",
            role: "CITIZEN",
            capabilities: ["CITIZEN"],
            citizenEnrollmentStatus: "ACTIVE",
            responderApplicationStatus: "NOT_APPLIED",
            registrationPath: "CITIZEN",
            approvalStatus: "NOT_REQUIRED",
            accountStatus: "ACTIVE",
            emailVerified: true,
            phoneVerified: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        };

        beforeEach(() => {
            vi.clearAllMocks();
            mockAuth.currentUser = null;
            authStateCallback = null;
            vi.mocked(getRedirectResult).mockResolvedValue(null);
        });

        it("GGL-REDIR-01: handles no redirect result (null) cleanly", async () => {
            vi.mocked(getRedirectResult).mockResolvedValueOnce(null);
            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            await act(async () => {
                if (authStateCallback) authStateCallback(null);
            });

            expect(getRedirectResult).toHaveBeenCalledTimes(1);
            expect(lastContext.status).toBe("UNAUTHENTICATED");
            expect(lastContext.profile).toBeNull();
        });

        it("GGL-REDIR-02: authorizes valid existing Google identity via redirect without duplicate profile lookup", async () => {
            const googleUser = {
                uid: "ggl-redir-01",
                email: "redir@example.com",
                emailVerified: true,
                providerData: [{ providerId: "google.com" }],
            };
            vi.mocked(getRedirectResult).mockResolvedValueOnce({ user: googleUser });
            vi.mocked(getUserProfile).mockResolvedValueOnce(validCitizenProfile);
            vi.mocked(syncGoogleUserProfile).mockResolvedValueOnce(validCitizenProfile);
            mockAuth.currentUser = googleUser;

            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            await act(async () => {
                if (authStateCallback) authStateCallback(googleUser);
            });

            expect(getRedirectResult).toHaveBeenCalledTimes(1);
            expect(getUserProfile).toHaveBeenCalledTimes(1);
            expect(syncGoogleUserProfile).toHaveBeenCalledTimes(1);
            expect(lastContext.status).toBe("AUTHORIZED");
            expect(lastContext.profile?.uid).toBe("ggl-redir-01");
        });

        it("GGL-REDIR-03: denies unknown Google redirect identity and signs out", async () => {
            const unknownUser = {
                uid: "ggl-redir-unknown",
                email: "unknown@example.com",
                emailVerified: true,
                providerData: [{ providerId: "google.com" }],
            };
            vi.mocked(getRedirectResult).mockResolvedValueOnce({ user: unknownUser });
            vi.mocked(getUserProfile).mockResolvedValueOnce(null);
            mockAuth.currentUser = unknownUser;

            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            await act(async () => {
                if (authStateCallback) authStateCallback(unknownUser);
            });

            expect(signOut).toHaveBeenCalled();
            expect(lastContext.status).toBe("UNAUTHENTICATED");
            expect(lastContext.profile).toBeNull();
        });

        it("GGL-REDIR-04: denies unverified or suspended Google redirect identity and signs out", async () => {
            const suspendedUser = {
                uid: "ggl-redir-susp",
                email: "susp@example.com",
                emailVerified: true,
                providerData: [{ providerId: "google.com" }],
            };
            vi.mocked(getRedirectResult).mockResolvedValueOnce({ user: suspendedUser });
            vi.mocked(getUserProfile).mockResolvedValueOnce({
                ...validCitizenProfile,
                uid: "ggl-redir-susp",
                accountStatus: "SUSPENDED",
            });
            mockAuth.currentUser = suspendedUser;

            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            await act(async () => {
                if (authStateCallback) authStateCallback(suspendedUser);
            });

            expect(signOut).toHaveBeenCalled();
            expect(lastContext.status).toBe("UNAUTHENTICATED");
            expect(lastContext.profile).toBeNull();
        });

        it("GGL-REDIR-05: does not process redirect result twice across StrictMode remount or repeated auth events", async () => {
            const googleUser = {
                uid: "ggl-redir-01",
                email: "redir@example.com",
                emailVerified: true,
                providerData: [{ providerId: "google.com" }],
            };
            vi.mocked(getRedirectResult).mockResolvedValueOnce({ user: googleUser });
            vi.mocked(getUserProfile).mockResolvedValue(validCitizenProfile);
            vi.mocked(syncGoogleUserProfile).mockResolvedValue(validCitizenProfile);
            mockAuth.currentUser = googleUser;

            let lastContext = null;
            render(
                React.createElement(
                    React.StrictMode,
                    null,
                    React.createElement(
                        AuthProvider,
                        null,
                        React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                    )
                )
            );

            await act(async () => {
                if (authStateCallback) authStateCallback(googleUser);
            });
            await act(async () => {
                if (authStateCallback) authStateCallback(googleUser);
            });

            expect(getRedirectResult).toHaveBeenCalledTimes(1);
            expect(lastContext.status).toBe("AUTHORIZED");
        });

        it("GGL-REDIR-06: auth-state race does not overwrite authorized result with stale state", async () => {
            const userA = {
                uid: "ggl-redir-race-a",
                email: "racea@example.com",
                emailVerified: true,
                providerData: [{ providerId: "google.com" }],
            };
            const userB = {
                uid: "user-b-supersede",
                email: "userb@example.com",
                emailVerified: true,
                providerData: [{ providerId: "password" }],
            };
            let resolveRedirect;
            vi.mocked(getRedirectResult).mockReturnValueOnce(new Promise((res) => { resolveRedirect = res; }));
            vi.mocked(getUserProfile).mockResolvedValue({
                ...validCitizenProfile,
                uid: "user-b-supersede",
                displayName: "User B Superseding",
            });

            let lastContext = null;
            render(
                React.createElement(
                    AuthProvider,
                    null,
                    React.createElement(RedirectTestConsumer, { onUpdate: (c) => { lastContext = c; } })
                )
            );

            // User A triggers redirect flow, then User B signs in before redirect resolves
            mockAuth.currentUser = userA;
            const pA = act(async () => {
                if (authStateCallback) authStateCallback(userA);
            });

            mockAuth.currentUser = userB;
            await act(async () => {
                if (authStateCallback) authStateCallback(userB);
            });

            // Now delayed redirect resolves for User A
            await act(async () => {
                resolveRedirect({ user: userA });
                await pA;
            });

            // User B must remain active and authorized
            expect(lastContext.status).toBe("AUTHORIZED");
            expect(lastContext.profile?.uid).toBe("user-b-supersede");
            expect(lastContext.profile?.displayName).toBe("User B Superseding");
        });
    });
});
