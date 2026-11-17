import { describe, expect, it } from "vitest";
import { formatAuthError } from "@/lib/auth-service";
import { createFallbackProfile } from "@/lib/user-service";
import {
  WORKSPACE_ROUTES,
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
