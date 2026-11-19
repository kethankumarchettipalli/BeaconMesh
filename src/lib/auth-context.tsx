import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";
import {
  getUserProfile,
  syncGoogleUserProfile,
  createFallbackProfile,
  syncEmailVerificationMirror,
} from "./user-service";
import { logOut, checkReloadEmailVerified } from "./auth-service";
import type {
  UserProfile,
  UserRole,
  UserCapability,
  ResponderDutyStatus,
  ResponderSubtype,
  CommandLevel,
  ApprovalStatus,
  AccountStatus,
  AuthStateStatus,
  RoleAuthorizationResult,
} from "./auth-types";
import {
  SESSION_ROLE_KEY,
  PENDING_RESPONDER_ROUTE,
  WORKSPACE_ROUTES,
} from "./auth-types";

export function isPendingResponderApplicant(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return (
    (profile.requestedRole === "RESPONDER" && profile.approvalStatus === "PENDING") ||
    profile.responderApplicationStatus === "PENDING"
  );
}

export function evaluateRoleAuthorization(
  profile: UserProfile | null,
  selectedRole: UserRole,
): RoleAuthorizationResult {
  const unauthorizedMessage =
    "You do not have access to this dashboard. Please select an authorized role or contact your administrator.";

  if (!profile) {
    return {
      isAuthorized: false,
      isPending: false,
      destinationRoute: null,
      errorMessage: unauthorizedMessage,
    };
  }

  if (profile.accountStatus === "SUSPENDED") {
    return {
      isAuthorized: false,
      isPending: false,
      destinationRoute: null,
      errorMessage:
        "Your account is currently suspended. Please contact your coordinator or operations command.",
    };
  }

  // 1. Citizen Role Selection
  if (selectedRole === "CITIZEN") {
    const hasCitizenCap =
      Boolean(profile.capabilities?.includes("CITIZEN")) &&
      profile.citizenEnrollmentStatus === "ACTIVE";

    const isStandardCitizen =
      profile.role === "CITIZEN" &&
      profile.citizenEnrollmentStatus === "ACTIVE";

    if (hasCitizenCap || isStandardCitizen) {
      return {
        isAuthorized: true,
        isPending: false,
        destinationRoute: WORKSPACE_ROUTES.CITIZEN,
        errorMessage: null,
      };
    }

    return {
      isAuthorized: false,
      isPending: false,
      destinationRoute: null,
      errorMessage: unauthorizedMessage,
    };
  }

  // 2. Responder Role Selection
  if (selectedRole === "RESPONDER") {
    if (isPendingResponderApplicant(profile)) {
      return {
        isAuthorized: false,
        isPending: true,
        destinationRoute: PENDING_RESPONDER_ROUTE,
        errorMessage: null,
      };
    }

    const isApprovedResponder =
      (Boolean(profile.capabilities?.includes("RESPONDER")) || profile.role === "RESPONDER") &&
      profile.approvalStatus === "APPROVED";

    if (isApprovedResponder) {
      return {
        isAuthorized: true,
        isPending: false,
        destinationRoute: WORKSPACE_ROUTES.RESPONDER,
        errorMessage: null,
      };
    }

    return {
      isAuthorized: false,
      isPending: false,
      destinationRoute: null,
      errorMessage: unauthorizedMessage,
    };
  }

  // 3. Command Role Selection
  if (selectedRole === "COMMAND") {
    const isCommand =
      profile.role === "COMMAND" &&
      Boolean(profile.commandLevel);

    if (isCommand) {
      return {
        isAuthorized: true,
        isPending: false,
        destinationRoute: WORKSPACE_ROUTES.COMMAND,
        errorMessage: null,
      };
    }

    return {
      isAuthorized: false,
      isPending: false,
      destinationRoute: null,
      errorMessage: unauthorizedMessage,
    };
  }

  return {
    isAuthorized: false,
    isPending: false,
    destinationRoute: null,
    errorMessage: unauthorizedMessage,
  };
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  status: AuthStateStatus;
  loading: boolean;
  role: UserRole | null;
  sessionRole: UserRole | null;
  capabilities: UserCapability[];
  isCitizenAuthorized: boolean;
  isResponderAuthorized: boolean;
  dutyStatus?: ResponderDutyStatus;
  activeIncidentId?: string | null;
  responderSubtype: ResponderSubtype;
  commandLevel: CommandLevel;
  approvalStatus: ApprovalStatus | null;
  accountStatus: AccountStatus | null;
  emailVerified: boolean;
  isConfigured: boolean;
  setSessionRole: (role: UserRole | null) => void;
  setStatus: (status: AuthStateStatus) => void;
  refreshProfile: () => Promise<UserProfile | null>;
  reloadUser: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStateStatus>("INITIALIZING");
  const [loading, setLoading] = useState(true);
  const [sessionRole, setSessionRoleState] = useState<UserRole | null>(() => {
    if (typeof window !== "undefined") {
      try {
        return (sessionStorage.getItem(SESSION_ROLE_KEY) as UserRole) || null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const setSessionRole = useCallback((role: UserRole | null) => {
    setSessionRoleState(role);
    if (typeof window !== "undefined") {
      try {
        if (role) {
          sessionStorage.setItem(SESSION_ROLE_KEY, role);
        } else {
          sessionStorage.removeItem(SESSION_ROLE_KEY);
        }
      } catch {}
    }
  }, []);

  const fetchAndApplyProfile = useCallback(
    async (currentUser: User): Promise<UserProfile | null> => {
      setStatus("PROFILE_LOADING");
      try {
        let userProfile = await getUserProfile(currentUser.uid);
        if (!userProfile) {
          // If profile doc not yet created, attempt sync (e.g. Google sign-in)
          userProfile = await syncGoogleUserProfile(currentUser);
        }
        if (!userProfile) {
          userProfile = createFallbackProfile(currentUser);
        }

        // Mandatory Safeguard 4: Synchronize emailVerified mirror if confirmed by Firebase Auth
        if (currentUser.emailVerified && userProfile && !userProfile.emailVerified) {
          try {
            const synced = await syncEmailVerificationMirror(currentUser);
            if (synced) userProfile = synced;
          } catch (syncErr) {
            console.warn("Could not synchronize email verification mirror:", syncErr);
          }
        }

        setProfile(userProfile);

        // State Machine Evaluation (Strictly prioritized)
        if (userProfile.accountStatus === "SUSPENDED") {
          setStatus("SUSPENDED");
        } else if (!currentUser.emailVerified) {
          // Trusted Firebase Auth emailVerified property
          setStatus("EMAIL_UNVERIFIED");
        } else if (
          userProfile.capabilities.length === 0 &&
          userProfile.responderApplicationStatus === "PENDING"
        ) {
          // Responder-only pending applicant (no active Citizen or Responder capabilities)
          setStatus("RESPONDER_PENDING");
        } else if (
          userProfile.capabilities.length === 0 &&
          userProfile.approvalStatus === "REJECTED"
        ) {
          setStatus("UNAUTHORIZED");
        } else if (
          userProfile.capabilities.length > 0 ||
          userProfile.role === "COMMAND"
        ) {
          setStatus("AUTHORIZED");
        } else {
          setStatus("UNAUTHORIZED");
        }

        return userProfile;
      } catch (err) {
        console.warn("Could not load user profile (using fallback):", err);
        const fallback = createFallbackProfile(currentUser);
        setProfile(fallback);
        if (!currentUser.emailVerified) {
          setStatus("EMAIL_UNVERIFIED");
        } else {
          setStatus("PROFILE_ERROR");
        }
        return fallback;
      }
    },
    [],
  );

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      setLoading(false);
      setStatus("UNAUTHENTICATED");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setStatus("UNAUTHENTICATED");
        setLoading(false);
        return;
      }

      setLoading(true);
      await fetchAndApplyProfile(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchAndApplyProfile]);

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user) return null;
    return await fetchAndApplyProfile(user);
  }, [user, fetchAndApplyProfile]);

  const reloadUser = useCallback(async (): Promise<boolean> => {
    const verified = await checkReloadEmailVerified();
    if (user) {
      setUser({ ...user, emailVerified: verified } as User);
      await refreshProfile();
    }
    return verified;
  }, [user, refreshProfile]);

  const handleSignOut = useCallback(async () => {
    try {
      await logOut();
    } finally {
      setUser(null);
      setProfile(null);
      setSessionRoleState(null);
      setStatus("UNAUTHENTICATED");
      try {
        sessionStorage.removeItem(SESSION_ROLE_KEY);
        localStorage.removeItem("beaconmesh-role");
        localStorage.removeItem("beaconmesh-responder-type");
      } catch {}
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  }, []);

  const capabilities = profile?.capabilities ?? [];
  const isCitizenAuthorized =
    capabilities.includes("CITIZEN") &&
    profile?.citizenEnrollmentStatus === "ACTIVE" &&
    profile?.accountStatus === "ACTIVE";
  const isResponderAuthorized =
    capabilities.includes("RESPONDER") &&
    profile?.approvalStatus === "APPROVED" &&
    profile?.accountStatus === "ACTIVE";

  const value: AuthContextValue = {
    user,
    profile,
    status,
    loading,
    role: profile?.role ?? null,
    sessionRole,
    capabilities,
    isCitizenAuthorized,
    isResponderAuthorized,
    dutyStatus: profile?.dutyStatus,
    activeIncidentId: profile?.activeIncidentId,
    responderSubtype: profile?.responderSubtype ?? null,
    commandLevel: profile?.commandLevel ?? null,
    approvalStatus: profile?.approvalStatus ?? null,
    accountStatus: profile?.accountStatus ?? null,
    emailVerified: Boolean(user?.emailVerified),
    isConfigured: isFirebaseConfigured,
    setSessionRole,
    setStatus,
    refreshProfile,
    reloadUser,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
