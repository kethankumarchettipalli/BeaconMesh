import React, { createContext, useContext, useEffect, useState, useCallback, useRef, } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";
import { getUserProfile, isValidProfileStructure, syncEmailVerificationMirror, } from "./user-service";
import { logOut, checkReloadEmailVerified, handleAuthRedirectResult } from "./auth-service";
import { SESSION_ROLE_KEY, PENDING_RESPONDER_ROUTE, WORKSPACE_ROUTES, } from "./auth-types";
export function isPendingResponderApplicant(profile) {
    if (!profile)
        return false;
    return ((profile.requestedRole === "RESPONDER" && profile.approvalStatus === "PENDING") ||
        profile.responderApplicationStatus === "PENDING");
}
export function evaluateRoleAuthorization(profile, selectedRole) {
    const unauthorizedMessage = "You do not have access to this dashboard. Please select an authorized role or contact your administrator.";
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
            errorMessage: "Your account is currently suspended. Please contact your coordinator or operations command.",
        };
    }
    // 1. Citizen Role Selection
    if (selectedRole === "CITIZEN") {
        const hasCitizenCap = Boolean(profile.capabilities?.includes("CITIZEN")) &&
            profile.citizenEnrollmentStatus === "ACTIVE";
        const isStandardCitizen = profile.role === "CITIZEN" &&
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
        const isApprovedResponder = (Boolean(profile.capabilities?.includes("RESPONDER")) || profile.role === "RESPONDER") &&
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
        const isCommand = profile.role === "COMMAND" &&
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
const AuthContext = createContext(undefined);
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [status, setStatus] = useState("INITIALIZING");
    const [loading, setLoading] = useState(true);
    const activeRequestIdRef = useRef(0);
    const redirectAttemptedRef = useRef(false);
    const redirectPromiseRef = useRef(null);
    const [sessionRole, setSessionRoleState] = useState(() => {
        if (typeof window !== "undefined") {
            try {
                return sessionStorage.getItem(SESSION_ROLE_KEY) || null;
            }
            catch {
                return null;
            }
        }
        return null;
    });
    const setSessionRole = useCallback((role) => {
        setSessionRoleState(role);
        if (typeof window !== "undefined") {
            try {
                if (role) {
                    sessionStorage.setItem(SESSION_ROLE_KEY, role);
                }
                else {
                    sessionStorage.removeItem(SESSION_ROLE_KEY);
                }
            }
            catch { }
        }
    }, []);
    const applyEvaluatedProfile = useCallback((currentUser, activeProfile) => {
        setProfile(activeProfile);
        // State Machine Evaluation (Strictly prioritized)
        if (activeProfile.accountStatus === "SUSPENDED") {
            setStatus("SUSPENDED");
        }
        else if (!currentUser.emailVerified || !activeProfile.emailVerified) {
            // Trusted Firebase Auth emailVerified property + profile mirror requirement
            setStatus("EMAIL_UNVERIFIED");
        }
        else if (activeProfile.capabilities.length === 0 &&
            activeProfile.responderApplicationStatus === "PENDING") {
            // Responder-only pending applicant (no active Citizen or Responder capabilities)
            setStatus("RESPONDER_PENDING");
        }
        else if (activeProfile.capabilities.length === 0 &&
            activeProfile.approvalStatus === "REJECTED") {
            setStatus("UNAUTHORIZED");
        }
        else if (activeProfile.capabilities.length > 0 ||
            activeProfile.role === "COMMAND") {
            setStatus("AUTHORIZED");
        }
        else {
            setStatus("UNAUTHORIZED");
        }
        return activeProfile;
    }, []);
    const fetchAndApplyProfile = useCallback(async (currentUser, targetRequestId) => {
        const requestId = targetRequestId ?? ++activeRequestIdRef.current;
        setStatus("PROFILE_LOADING");
        try {
            const userProfile = await getUserProfile(currentUser.uid);
            // Invalidate if a newer request began, user signed out, or auth identity transitioned
            if (requestId !== activeRequestIdRef.current || !auth?.currentUser || auth.currentUser.uid !== currentUser.uid) {
                return null;
            }
            if (!userProfile) {
                // Profile does not exist in Firestore: strictly fail closed.
                // Do NOT synthesize fallback profiles. Do NOT auto-register.
                setProfile(null);
                setStatus("UNAUTHORIZED");
                return null;
            }

            // Validate profile structural integrity
            if (!isValidProfileStructure(userProfile)) {
                setProfile(null);
                setStatus("PROFILE_ERROR");
                return null;
            }

            let activeProfile = userProfile;

            // SEC-MIR-01: Synchronize emailVerified mirror if the Firebase Auth token is now
            // verified but the Firestore profile mirror has not been updated yet.
            // Restricted to email/password accounts only — Google sign-in must NOT use this path
            // to gain any provisioning or authorization bypass.
            const isGoogleProvider = currentUser.providerData?.some((p) => p.providerId === "google.com");
            if (!isGoogleProvider && currentUser.emailVerified && !activeProfile.emailVerified) {
                try {
                    const synced = await syncEmailVerificationMirror(currentUser);
                    if (requestId !== activeRequestIdRef.current || !auth?.currentUser || auth.currentUser.uid !== currentUser.uid) {
                        return null;
                    }
                    if (synced) activeProfile = synced;
                }
                catch (syncErr) {
                    // syncEmailVerificationMirror now throws on failure — log a clear diagnostic
                    // but do NOT crash the profile-loading flow. The user will remain in
                    // EMAIL_UNVERIFIED state which is the correct safe-fail outcome.
                    console.warn(
                        "[SEC-MIR-01] Email verification mirror synchronization failed:",
                        syncErr?.code || syncErr?.message,
                        "— user will remain in EMAIL_UNVERIFIED state until mirror is updated."
                    );
                }
            }

            if (requestId !== activeRequestIdRef.current || !auth?.currentUser || auth.currentUser.uid !== currentUser.uid) {
                return null;
            }

            return applyEvaluatedProfile(currentUser, activeProfile);
        }
        catch (err) {
            if (requestId !== activeRequestIdRef.current || !auth?.currentUser || auth.currentUser.uid !== currentUser.uid) {
                return null;
            }
            console.warn("Could not load user profile:", err);
            setProfile(null);
            setStatus("PROFILE_ERROR");
            return null;
        }
    }, [applyEvaluatedProfile]);
    useEffect(() => {
        if (!auth || !isFirebaseConfigured) {
            setLoading(false);
            setStatus("UNAUTHENTICATED");
            return;
        }
        if (!redirectAttemptedRef.current) {
            redirectAttemptedRef.current = true;
            redirectPromiseRef.current = handleAuthRedirectResult().catch((err) => {
                console.warn("[AuthProvider] Google redirect sign-in rejected or failed:", err?.code || err?.message);
                return null;
            });
        }
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            const requestId = ++activeRequestIdRef.current;
            setUser(currentUser);
            if (!currentUser) {
                setProfile(null);
                setStatus("UNAUTHENTICATED");
                setLoading(false);
                return;
            }
            // Immediately clear existing profile on identity change to prevent race condition exposure
            setProfile(null);
            setLoading(true);
            const redirectResult = redirectPromiseRef.current ? await redirectPromiseRef.current : null;
            if (requestId !== activeRequestIdRef.current || !auth?.currentUser || auth.currentUser.uid !== currentUser.uid) {
                return;
            }
            if (redirectResult && redirectResult.user?.uid === currentUser.uid && redirectResult.profile) {
                applyEvaluatedProfile(currentUser, redirectResult.profile);
            }
            else {
                await fetchAndApplyProfile(currentUser, requestId);
            }
            if (requestId === activeRequestIdRef.current) {
                setLoading(false);
            }
        });
        return () => {
            activeRequestIdRef.current++;
            unsubscribe();
        };
    }, [fetchAndApplyProfile, applyEvaluatedProfile]);
    const refreshProfile = useCallback(async () => {
        if (!user || !auth?.currentUser || auth.currentUser.uid !== user.uid)
            return null;
        const requestId = ++activeRequestIdRef.current;
        return await fetchAndApplyProfile(user, requestId);
    }, [user, fetchAndApplyProfile]);
    const reloadUser = useCallback(async () => {
        const verified = await checkReloadEmailVerified();
        if (user && auth?.currentUser && auth.currentUser.uid === user.uid) {
            setUser({ ...user, emailVerified: verified });
            await refreshProfile();
        }
        return verified;
    }, [user, refreshProfile]);
    const handleSignOut = useCallback(async () => {
        activeRequestIdRef.current++;
        try {
            await logOut();
        }
        finally {
            setUser(null);
            setProfile(null);
            setSessionRoleState(null);
            setStatus("UNAUTHENTICATED");
            setLoading(false);
            try {
                sessionStorage.removeItem(SESSION_ROLE_KEY);
                localStorage.removeItem("beaconmesh-role");
                localStorage.removeItem("beaconmesh-responder-type");
            }
            catch { }
            if (typeof window !== "undefined") {
                window.location.href = "/";
            }
        }
    }, []);
    const capabilities = profile?.capabilities ?? [];
    const isCitizenAuthorized = capabilities.includes("CITIZEN") &&
        profile?.citizenEnrollmentStatus === "ACTIVE" &&
        profile?.accountStatus === "ACTIVE";
    const isResponderAuthorized = capabilities.includes("RESPONDER") &&
        profile?.approvalStatus === "APPROVED" &&
        profile?.accountStatus === "ACTIVE";
    const value = {
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
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
