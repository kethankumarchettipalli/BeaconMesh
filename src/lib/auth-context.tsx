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
import { getUserProfile, syncGoogleUserProfile, createFallbackProfile } from "./user-service";
import { logOut, checkReloadEmailVerified } from "./auth-service";
import type {
  UserProfile,
  UserRole,
  ResponderSubtype,
  CommandLevel,
  ApprovalStatus,
  AccountStatus,
  AuthStateStatus,
} from "./auth-types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  status: AuthStateStatus;
  loading: boolean;
  role: UserRole | null;
  responderSubtype: ResponderSubtype;
  commandLevel: CommandLevel;
  approvalStatus: ApprovalStatus | null;
  accountStatus: AccountStatus | null;
  emailVerified: boolean;
  isConfigured: boolean;
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

  const fetchAndApplyProfile = useCallback(
    async (currentUser: User): Promise<UserProfile | null> => {
      try {
        let userProfile = await getUserProfile(currentUser.uid);
        if (!userProfile) {
          // If profile doc not yet created, attempt sync (e.g. Google sign-in)
          userProfile = await syncGoogleUserProfile(currentUser);
        }
        if (!userProfile) {
          userProfile = createFallbackProfile(currentUser);
        }
        setProfile(userProfile);

        if (userProfile.accountStatus === "SUSPENDED") {
          setStatus("SUSPENDED");
        } else if (!currentUser.emailVerified) {
          setStatus("EMAIL_UNVERIFIED");
        } else if (
          userProfile.requestedRole === "RESPONDER" &&
          userProfile.approvalStatus === "PENDING" &&
          userProfile.role !== "RESPONDER"
        ) {
          setStatus("PENDING_APPROVAL");
        } else {
          setStatus("AUTHORIZED");
        }

        return userProfile;
      } catch (err) {
        console.warn("Could not load user profile (using in-memory fallback):", err);
        const fallback = createFallbackProfile(currentUser);
        setProfile(fallback);
        if (!currentUser.emailVerified) {
          setStatus("EMAIL_UNVERIFIED");
        } else {
          setStatus("AUTHORIZED");
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
      setStatus("unauthenticated");
      try {
        localStorage.removeItem("beaconmesh-role");
        localStorage.removeItem("beaconmesh-responder-type");
      } catch {}
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    status,
    loading,
    role: profile?.role ?? null,
    responderSubtype: profile?.responderSubtype ?? null,
    commandLevel: profile?.commandLevel ?? null,
    approvalStatus: profile?.approvalStatus ?? null,
    accountStatus: profile?.accountStatus ?? null,
    emailVerified: Boolean(user?.emailVerified),
    isConfigured: isFirebaseConfigured,
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
