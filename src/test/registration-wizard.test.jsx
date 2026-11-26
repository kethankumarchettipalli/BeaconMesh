import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockRefreshProfile = vi.fn();
const mockLogOut = vi.fn();
let mockAuthState = {
  user: null,
  profile: null,
  status: "UNAUTHENTICATED",
  loading: false,
  isConfigured: true,
  refreshProfile: mockRefreshProfile,
  signOut: mockLogOut,
  setSessionRole: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }) => React.createElement("a", { href: to, ...props }, children),
  useNavigate: () => mockNavigate,
  useRouterState: ({ select }) =>
    select({
      location: { pathname: "/signup", search: "" },
    }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mockAuthState,
  evaluateRoleAuthorization: vi.fn(),
}));

const mockFirebaseAuth = { currentUser: null };
vi.mock("@/lib/firebase", () => ({
  get auth() {
    return mockFirebaseAuth;
  },
  db: undefined,
  isFirebaseConfigured: true,
}));

const mockCreateUser = vi.fn();
const mockSendVerification = vi.fn();
const mockSendReset = vi.fn();
const mockApplyAction = vi.fn();
const mockUpdatePassword = vi.fn();
const mockUpdateProfile = vi.fn();
const mockSignOut = vi.fn();

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createUserWithEmailAndPassword: (...args) => mockCreateUser(...args),
    sendEmailVerification: (...args) => mockSendVerification(...args),
    sendPasswordResetEmail: (...args) => mockSendReset(...args),
    applyActionCode: (...args) => mockApplyAction(...args),
    updatePassword: (...args) => mockUpdatePassword(...args),
    updateProfile: (...args) => mockUpdateProfile(...args),
    signOut: (...args) => mockSignOut(...args),
  };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDoc: vi.fn(async () => ({ exists: () => false })),
    setDoc: vi.fn(async () => {}),
  };
});

import {
  generateCryptographicTemporaryPassword,
  startEmailVerificationRegistration,
  confirmVerifiedEmailAndRefreshToken,
  isEmailSignInLink,
  setUserPassword,
  checkUserRegistrationStatus,
} from "@/lib/auth-service";
import { createInitialUserProfile } from "@/lib/user-service";
import { normalizeUserProfile } from "@/lib/user-normalization";
import { BeaconPage } from "@/components/beaconmesh/app";
import { RegistrationWizard } from "@/components/beaconmesh/registration-wizard";

describe("Progressive Registration Wizard & Verification-First Architecture", () => {
  describe("Auth Service Extension Functions", () => {
    it("isEmailSignInLink accurately detects email sign-in links", () => {
      // With null/empty auth or non-link URL, returns false
      expect(isEmailSignInLink("https://beaconmesh.org/signup")).toBe(false);
      expect(isEmailSignInLink("https://beaconmesh.org/login")).toBe(false);
    });

    it("checkUserRegistrationStatus handles non-existent and empty profiles gracefully", async () => {
      const status = await checkUserRegistrationStatus(null);
      expect(status.isRegistered).toBe(false);
      expect(status.profile).toBe(null);
    });

    it("setUserPassword rejects when no currentUser is authenticated", async () => {
      await expect(setUserPassword("test-password-123")).rejects.toThrow(
        "No authenticated user session found."
      );
    });
  });

  describe("User Service: Location & Specialization Fields", () => {
    it("creates Citizen profile with verified email and location fields", async () => {
      const mockUser = {
        uid: "test-citizen-01",
        email: "citizen@example.com",
        displayName: "Citizen Test",
        emailVerified: true,
      };

      const params = {
        fullName: "Citizen Test",
        phoneNumber: "+91 98765 00001",
        role: "CITIZEN",
        region: "Andhra Pradesh",
        district: "Krishna",
        city: "Vijayawada",
      };

      const profile = await createInitialUserProfile(mockUser, params);

      expect(profile.uid).toBe("test-citizen-01");
      expect(profile.role).toBe("CITIZEN");
      expect(profile.registrationPath).toBe("CITIZEN");
      expect(profile.capabilities).toEqual(["CITIZEN"]);
      expect(profile.citizenEnrollmentStatus).toBe("ACTIVE");
      expect(profile.approvalStatus).toBe("NOT_REQUIRED");
      expect(profile.emailVerified).toBe(true);
      expect(profile.region).toBe("Andhra Pradesh");
      expect(profile.district).toBe("Krishna");
      expect(profile.city).toBe("Vijayawada");
      expect(profile.organization).toBeNull();
      expect(profile.requestedUnit).toBeNull();
      expect(Object.values(profile)).not.toContain(undefined);
    });

    it("creates Responder application with quarantined capabilities and operational fields", async () => {
      const mockUser = {
        uid: "test-resp-01",
        email: "medic@example.com",
        displayName: "Medic Responder",
        emailVerified: true,
      };

      const params = {
        fullName: "Medic Responder",
        phoneNumber: "+91 98765 00002",
        role: "RESPONDER",
        responderSubtype: "PROFESSIONAL",
        region: "Andhra Pradesh",
        district: "Guntur",
        city: "Guntur City",
        organization: "Red Cross EMS",
        requestedUnit: "MEDICAL",
        designation: "Paramedic Lead",
        experienceYears: 5,
        credentialsSummary: "BLS, ACLS certified",
      };

      const profile = await createInitialUserProfile(mockUser, params);

      expect(profile.uid).toBe("test-resp-01");
      // Critical defense: role must be CITIZEN base until approved
      expect(profile.role).toBe("CITIZEN");
      expect(profile.registrationPath).toBe("RESPONDER");
      // Capabilities must be quarantined to []
      expect(profile.capabilities).toEqual([]);
      expect(profile.citizenEnrollmentStatus).toBe("INACTIVE");
      expect(profile.responderApplicationStatus).toBe("PENDING");
      expect(profile.approvalStatus).toBe("PENDING");
      expect(profile.requestedRole).toBe("RESPONDER");
      expect(profile.requestedResponderSubtype).toBe("PROFESSIONAL");
      expect(profile.emailVerified).toBe(true);
      // Operational metadata
      expect(profile.region).toBe("Andhra Pradesh");
      expect(profile.district).toBe("Guntur");
      expect(profile.city).toBe("Guntur City");
      expect(profile.organization).toBe("Red Cross EMS");
      expect(profile.requestedUnit).toBe("MEDICAL");
      expect(profile.designation).toBe("Paramedic Lead");
      expect(profile.experienceYears).toBe(5);
      expect(profile.credentialsSummary).toBe("BLS, ACLS certified");
    });
  });

  describe("User Normalization: Safe preservation of new fields", () => {
    it("preserves new location and responder specialization fields during normalization", () => {
      const raw = {
        uid: "norm-test-01",
        displayName: "Sample User",
        email: "sample@example.com",
        role: "CITIZEN",
        capabilities: ["CITIZEN"],
        citizenEnrollmentStatus: "ACTIVE",
        responderApplicationStatus: "NOT_APPLIED",
        registrationPath: "CITIZEN",
        approvalStatus: "NOT_REQUIRED",
        accountStatus: "ACTIVE",
        emailVerified: true,
        region: "Telangana",
        district: "Hyderabad",
        city: "Secunderabad",
        organization: "Disaster Relief Volunteer Group",
        requestedUnit: "GENERAL",
        designation: "Field Volunteer",
        experienceYears: 3,
        credentialsSummary: "Community First Responder Certified",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const normalized = normalizeUserProfile(raw);

      expect(normalized.region).toBe("Telangana");
      expect(normalized.district).toBe("Hyderabad");
      expect(normalized.city).toBe("Secunderabad");
      expect(normalized.organization).toBe("Disaster Relief Volunteer Group");
      expect(normalized.requestedUnit).toBe("GENERAL");
      expect(normalized.designation).toBe("Field Volunteer");
      expect(normalized.experienceYears).toBe(3);
      expect(normalized.credentialsSummary).toBe("Community First Responder Certified");
    });

    it("defaults missing optional fields to null during normalization", () => {
      const raw = {
        uid: "norm-test-02",
        displayName: "Minimal User",
        email: "minimal@example.com",
        role: "CITIZEN",
        capabilities: ["CITIZEN"],
        citizenEnrollmentStatus: "ACTIVE",
        approvalStatus: "NOT_REQUIRED",
        accountStatus: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const normalized = normalizeUserProfile(raw);

      expect(normalized.region).toBeNull();
      expect(normalized.district).toBeNull();
      expect(normalized.city).toBeNull();
      expect(normalized.organization).toBeNull();
      expect(normalized.requestedUnit).toBeNull();
      expect(normalized.designation).toBeNull();
      expect(normalized.experienceYears).toBeNull();
      expect(normalized.credentialsSummary).toBeNull();
    });
  });

  describe("Signup Route Rendering", () => {
    it("renders the 4-step RegistrationWizard on /signup instead of single-form SignupForm", () => {
      render(React.createElement(BeaconPage));

      expect(screen.getAllByText("Email Verification").length).toBeGreaterThan(0);
      expect(screen.getByText("Profile & Role")).toBeInTheDocument();
      expect(screen.getByText("Password Setup")).toBeInTheDocument();
      expect(screen.getByText("Complete Registration")).toBeInTheDocument();
      expect(screen.queryByText(/Continue with Google/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Confirm password/i)).not.toBeInTheDocument();
    });
  });

  describe("Verification-First Registration Security & Recovery", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockFirebaseAuth.currentUser = null;
      mockAuthState = {
        user: null,
        profile: null,
        status: "UNAUTHENTICATED",
        loading: false,
        isConfigured: true,
        refreshProfile: mockRefreshProfile,
        signOut: mockLogOut,
        setSessionRole: vi.fn(),
      };
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.clear();
      }
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.clear();
      }
    });

    it("generates CSPRNG temporary password using crypto.getRandomValues and never persists it", async () => {
      const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
      const pwd = generateCryptographicTemporaryPassword();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
      expect(spy.mock.calls[0][0].length).toBeGreaterThanOrEqual(32);
      expect(pwd.length).toBeGreaterThanOrEqual(40);
      spy.mockRestore();

      const createdUser = { uid: "temp-uid-1", email: "newuser@example.com", emailVerified: false };
      mockCreateUser.mockResolvedValueOnce({ user: createdUser });
      mockSendVerification.mockResolvedValueOnce();

      const res = await startEmailVerificationRegistration("newuser@example.com");
      expect(res.emailSent).toBe(true);
      const passedPwd = mockCreateUser.mock.calls[0][2];
      expect(passedPwd).toBeTruthy();
      expect(window.localStorage.getItem("emailForSignIn")).toBeNull();
      expect(JSON.stringify(window.sessionStorage)).not.toContain(passedPwd);
    });

    it("checks both reload() emailVerified and refreshed JWT email_verified claim", async () => {
      const mockUser = {
        uid: "verify-uid-1",
        email: "verify@example.com",
        emailVerified: false,
        reload: vi.fn(async function () {
          this.emailVerified = true;
        }),
        getIdTokenResult: vi.fn(async () => ({ claims: { email_verified: false } })),
      };
      mockFirebaseAuth.currentUser = mockUser;

      // Token claim disagrees (false) -> must remain unverified
      const disagreed = await confirmVerifiedEmailAndRefreshToken();
      expect(mockUser.reload).toHaveBeenCalledTimes(1);
      expect(mockUser.getIdTokenResult).toHaveBeenCalledWith(true);
      expect(disagreed.verified).toBe(false);

      // Both agree -> verified
      mockUser.getIdTokenResult.mockResolvedValueOnce({ claims: { email_verified: true } });
      const agreed = await confirmVerifiedEmailAndRefreshToken();
      expect(agreed.verified).toBe(true);
    });

    it("retains safe recovery state when account creation succeeds but sendEmailVerification fails", async () => {
      const createdUser = { uid: "uid-mail-fail", email: "failmail@example.com", emailVerified: false };
      mockCreateUser.mockResolvedValueOnce({ user: createdUser });
      mockSendVerification.mockRejectedValueOnce(new Error("SMTP temporary outage"));

      render(React.createElement(RegistrationWizard));

      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "failmail@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Send Verification Email/i }));

      await waitFor(() => {
        expect(screen.getByText(/Check your inbox/i)).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /Resend verification email/i })).toBeInTheDocument();
      expect(mockCreateUser).toHaveBeenCalledTimes(1);

      // Resend works and triggers cooldown
      mockFirebaseAuth.currentUser = createdUser;
      mockSendVerification.mockResolvedValueOnce();
      fireEvent.click(screen.getByRole("button", { name: /Resend verification email/i }));
      await waitFor(() => {
        expect(mockSendVerification).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByRole("button", { name: /Resend email in 60s/i })).toBeDisabled();
    });

    it("keeps unverified user blocked on Step 1 and unlocks Step 2 after verification on another device", async () => {
      const unverifiedUser = {
        uid: "cross-dev-1",
        email: "crossdev@example.com",
        emailVerified: false,
        reload: vi.fn(async () => {}),
        getIdTokenResult: vi.fn(async () => ({ claims: { email_verified: false } })),
      };
      mockFirebaseAuth.currentUser = unverifiedUser;
      mockAuthState.user = unverifiedUser;

      render(React.createElement(RegistrationWizard));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /I've Verified My Email/i })).toBeInTheDocument();
      });

      // Click before verified -> stays on Step 1
      fireEvent.click(screen.getByRole("button", { name: /I've Verified My Email/i }));
      await waitFor(() => {
        expect(screen.getByText(/Email is not verified yet/i)).toBeInTheDocument();
      });
      expect(screen.queryByPlaceholderText("Alex Morgan")).not.toBeInTheDocument();

      // Verified on another device -> reload + token refresh -> unlocks Step 2
      unverifiedUser.reload.mockImplementationOnce(async () => {
        unverifiedUser.emailVerified = true;
      });
      unverifiedUser.getIdTokenResult.mockResolvedValueOnce({ claims: { email_verified: true } });

      fireEvent.click(screen.getByRole("button", { name: /I've Verified My Email/i }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Alex Morgan")).toBeInTheDocument();
      });
    });

    it("handles duplicate email-already-in-use with explicit Sign In and deliberate Recover Account options", async () => {
      const dupErr = new Error("Email already in use");
      dupErr.code = "auth/email-already-in-use";
      mockCreateUser.mockRejectedValueOnce(dupErr);

      render(React.createElement(RegistrationWizard));

      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "existing@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Send Verification Email/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sign in to existing account/i })).toBeInTheDocument();
      });
      expect(mockSendReset).not.toHaveBeenCalled();

      // Deliberate click sends password reset
      mockSendReset.mockResolvedValueOnce();
      fireEvent.click(screen.getByRole("button", { name: /Recover account/i }));
      await waitFor(() => {
        expect(mockSendReset).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByPlaceholderText("Alex Morgan")).not.toBeInTheDocument();
    });

    it("aborts registration before profile creation when permanent password update fails", async () => {
      const verifiedUser = {
        uid: "pwd-fail-uid",
        email: "pwdfail@example.com",
        emailVerified: true,
        reload: vi.fn(async () => {}),
        getIdTokenResult: vi.fn(async () => ({ claims: { email_verified: true } })),
      };
      mockFirebaseAuth.currentUser = verifiedUser;
      mockAuthState.user = verifiedUser;
      mockUpdatePassword.mockRejectedValueOnce(Object.assign(new Error("Requires recent login"), { code: "auth/requires-recent-login" }));

      render(React.createElement(RegistrationWizard));

      // Wait for Step 2 unlock
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Alex Morgan")).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText("Alex Morgan"), { target: { value: "Test Citizen" } });
      fireEvent.click(screen.getByRole("button", { name: /Continue to Password Setup/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Minimum 8 characters")).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText("Minimum 8 characters"), { target: { value: "StrongPass123!" } });
      fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: "StrongPass123!" } });
      fireEvent.click(screen.getByRole("button", { name: /Review & Finalize/i }));

      await waitFor(() => {
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: /Complete Registration/i }));

      await waitFor(() => {
        expect(screen.getByText(/needs to be refreshed before setting a permanent password/i)).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockRefreshProfile).not.toHaveBeenCalled();
    });

    it("rejects createInitialUserProfile when user email is not verified or role is COMMAND", async () => {
      await expect(
        createInitialUserProfile({ uid: "u1", email: "u1@example.com", emailVerified: false }, { fullName: "Unverified", role: "CITIZEN" })
      ).rejects.toThrow(/Email verification is required/i);

      await expect(
        createInitialUserProfile({ uid: "u2", email: "u2@example.com", emailVerified: true }, { fullName: "Admin", role: "COMMAND" })
      ).rejects.toThrow(/Command accounts cannot be created/i);
    });

    it("displays live password strength indicator from Weak to Strong on Step 3", async () => {
      const verifiedUser = {
        uid: "pwd-strength-uid",
        email: "strength@example.com",
        emailVerified: true,
        reload: vi.fn(async () => {}),
        getIdTokenResult: vi.fn(async () => ({ claims: { email_verified: true } })),
      };
      mockFirebaseAuth.currentUser = verifiedUser;
      mockAuthState.user = verifiedUser;

      render(React.createElement(RegistrationWizard));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Alex Morgan")).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText("Alex Morgan"), { target: { value: "Alex Morgan" } });
      fireEvent.click(screen.getByRole("button", { name: /Continue to Password Setup/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Minimum 8 characters")).toBeInTheDocument();
      });

      const pwdInput = screen.getByPlaceholderText("Minimum 8 characters");
      expect(screen.getByText("Enter a password")).toBeInTheDocument();

      fireEvent.change(pwdInput, { target: { value: "abc" } });
      expect(screen.getByText("Weak")).toBeInTheDocument();

      fireEvent.change(pwdInput, { target: { value: "Abcdefg1" } });
      expect(screen.getByText("Good")).toBeInTheDocument();

      fireEvent.change(pwdInput, { target: { value: "Abcdefg1!" } });
      expect(screen.getByText("Strong")).toBeInTheDocument();
    });
  });
});
