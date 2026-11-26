import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, sendEmailVerification, sendPasswordResetEmail, applyActionCode, updateProfile, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, updatePassword, } from "firebase/auth";
import { auth } from "./firebase";
import { createInitialUserProfile, syncGoogleUserProfile, updateProfileEmailVerified, getUserProfile, isValidProfileStructure, } from "./user-service";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
/**
 * Maps Firebase auth error codes to clear, helpful user messages.
 */
export function formatAuthError(error) {
    if (typeof error !== "object" || error === null)
        return "An unexpected error occurred.";
    const err = error;
    switch (err.code) {
        case "auth/invalid-email":
            return "Please enter a valid email address.";
        case "auth/user-disabled":
            return "This account has been disabled. Please contact support.";
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "Invalid email or password. Please check your credentials.";
        case "auth/user-not-found":
            return err.message || "No registered BeaconMesh account was found for this identity. Please register through the registration wizard first.";
        case "auth/user-suspended":
            return "Your account is currently suspended. Please contact operations administration.";
        case "auth/email-unverified":
            return "Your email address has not been verified yet. Please complete verification before signing in.";
        case "auth/malformed-profile":
            return "User account profile is invalid or corrupted. Please contact support.";
        case "auth/profile-lookup-failed":
            return "Failed to load account profile due to a network or database issue. Please try again.";
        case "auth/email-already-in-use":
            return "An account with this email address already exists. Please sign in.";
        case "auth/weak-password":
            return "Password is too weak. Please use at least 8 characters with a mix of letters and numbers.";
        case "auth/operation-not-allowed":
            return "This sign-in method is not enabled. Please contact the administrator.";
        case "auth/popup-blocked":
            return "The sign-in popup was blocked by your browser. Please allow popups or try again.";
        case "auth/popup-closed-by-user":
            return "Sign-in cancelled. Please try again.";
        case "auth/account-exists-with-different-credential":
            return "An account already exists with the same email using a different sign-in method.";
        case "auth/too-many-requests":
            return "Too many attempts. Access is temporarily locked. Please try again later.";
        case "auth/network-request-failed":
            return "Network error. Please check your internet connection.";
        case "auth/invalid-action-code":
            return "The action link is invalid, expired, or has already been used.";
        case "auth/expired-action-code":
            return "This verification link has expired. Please request a new one.";
        default:
            if (err.message?.includes("client is offline") ||
                err.message?.includes("Database '(default)' not found") ||
                err.message?.includes("Failed to get document")) {
                return "Cloud Firestore database is not yet created in your Firebase Console. Please go to your Firebase Console -> Firestore Database and click 'Create database' to enable persistent profiles.";
            }
            return err.message || "An authentication error occurred. Please try again.";
    }
}
/**
 * Register a new user with Email and Password.
 */
export async function registerWithEmail(params) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized. Check your environment settings.");
    if (params.role === "COMMAND") {
        throw new Error("Command accounts cannot be created via public registration. Contact a system administrator for provisioning.");
    }
    const credential = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
    // Set Firebase Auth user display name
    try {
        await updateProfile(credential.user, {
            displayName: params.fullName.trim(),
        });
    }
    catch (err) {
        console.warn("Could not set displayName on Firebase Auth user:", err);
    }
    // Send native Firebase email verification link
    try {
        await sendEmailVerification(credential.user);
    }
    catch (err) {
        console.warn("Failed to dispatch initial verification email:", err);
    }
    // Create initial profile in Firestore
    const profile = await createInitialUserProfile(credential.user, {
        fullName: params.fullName.trim(),
        phoneNumber: params.phoneNumber?.trim(),
        role: params.role,
        responderSubtype: params.responderSubtype,
    });
    return { user: credential.user, profile };
}
/**
 * Sign in existing user with Email and Password.
 */
export async function loginWithEmail(email, password) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
}
/**
 * Authorize an existing account for Google sign-in.
 * Enforces:
 * 1. Profile existence check in Firestore (rejects unknown identities with auth/user-not-found).
 * 2. Structural validation (rejects corrupt profiles with auth/malformed-profile).
 * 3. Account status check (rejects suspended users with auth/user-suspended).
 * 4. Email verification check (rejects unverified accounts with auth/email-unverified).
 * 5. On ANY denial, immediately executes signOut(auth) to prevent lingering sessions.
 * 6. On success, updates login timestamps via syncGoogleUserProfile.
 */
export async function verifyAndAuthorizeGoogleUser(user) {
    if (!user || !user.uid) {
        if (auth)
            await signOut(auth);
        const err = new Error("Invalid authentication credential.");
        err.code = "auth/invalid-credential";
        throw err;
    }

    // Step 1: Lookup existing profile from Firestore
    let existingProfile;
    try {
        existingProfile = await getUserProfile(user.uid);
    }
    catch (lookupErr) {
        if (auth)
            await signOut(auth);
        const err = new Error("Failed to verify user profile. Please check your network connection and try again.");
        err.code = "auth/profile-lookup-failed";
        throw err;
    }

    // Step 2: Enforce existing account requirement (No self-registration via Google)
    if (!existingProfile) {
        if (auth)
            await signOut(auth);
        const err = new Error("No BeaconMesh account found for this Google identity. Please register through the official registration wizard first.");
        err.code = "auth/user-not-found";
        throw err;
    }

    // Step 3: Validate profile structural integrity
    if (!isValidProfileStructure(existingProfile)) {
        if (auth)
            await signOut(auth);
        const err = new Error("User profile is corrupt or incomplete. Please contact support.");
        err.code = "auth/malformed-profile";
        throw err;
    }

    // Step 4: Enforce account status (Suspended accounts denied immediately)
    if (existingProfile.accountStatus === "SUSPENDED") {
        if (auth)
            await signOut(auth);
        const err = new Error("Your account is suspended. Contact operations administration.");
        err.code = "auth/user-suspended";
        throw err;
    }

    // Step 5: Enforce email verification (Account must already be verified in BeaconMesh profile)
    if (!existingProfile.emailVerified) {
        if (auth)
            await signOut(auth);
        const err = new Error("Email verification is required before signing in. Please verify your email first.");
        err.code = "auth/email-unverified";
        throw err;
    }

    // Step 6: Synchronize login timestamps / profile updates
    const syncedProfile = await syncGoogleUserProfile(user);
    return {
        user,
        profile: syncedProfile || existingProfile,
    };
}
/**
 * Sign in existing user with Google.
 * Attempts popup first; falls back to redirect if popup is blocked.
 * Strictly restricted to existing, verified, active BeaconMesh accounts.
 */
export async function loginWithGoogle() {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    try {
        const credential = await signInWithPopup(auth, googleProvider);
        return await verifyAndAuthorizeGoogleUser(credential.user);
    }
    catch (error) {
        const err = error;
        if (err.code === "auth/popup-blocked") {
            // Fallback to redirect flow
            await signInWithRedirect(auth, googleProvider);
            throw new Error("Redirecting to Google for authentication...");
        }
        throw error;
    }
}
/**
 * Handle redirect result if Google redirect was triggered.
 * Strictly restricted to existing, verified, active BeaconMesh accounts.
 */
export async function handleAuthRedirectResult() {
    if (!auth)
        return null;
    const credential = await getRedirectResult(auth);
    if (!credential || !credential.user)
        return null;
    return await verifyAndAuthorizeGoogleUser(credential.user);
}
/**
 * Resend verification email to current user.
 */
export async function resendVerificationEmail() {
    if (!auth || !auth.currentUser)
        throw new Error("No authenticated user found.");
    await sendEmailVerification(auth.currentUser);
}
/**
 * Complete email verification using Firebase action code from URL.
 */
export async function completeEmailVerification(oobCode) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    await applyActionCode(auth, oobCode);
    if (auth.currentUser) {
        await auth.currentUser.reload();
        await updateProfileEmailVerified(auth.currentUser.uid);
    }
}
/**
 * Send password reset email.
 */
export async function resetPassword(email) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    await sendPasswordResetEmail(auth, email.trim());
}
/**
 * Reload the current Firebase user and return whether email is verified.
 */
export async function checkReloadEmailVerified() {
    if (!auth || !auth.currentUser)
        return false;
    await auth.currentUser.reload();
    const verified = auth.currentUser.emailVerified;
    if (verified) {
        await updateProfileEmailVerified(auth.currentUser.uid);
    }
    return verified;
}
/**
 * Sign out current user.
 */
export async function logOut() {
    if (!auth)
        return;
    await signOut(auth);
}
/**
 * Generate a cryptographically secure random temporary password (at least 32 random bytes).
 * Never stored in state, storage, logs, or telemetry.
 */
export function generateCryptographicTemporaryPassword() {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
        throw new Error("Cryptographically secure random generator is unavailable.");
    }
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // Ensure character class diversity for Firebase password policy
    return `Bm!9${token}`;
}

/**
 * Start verification-first registration using standard Email/Password + sendEmailVerification:
 * 1. Creates an unprivileged Firebase Auth user with a short-lived CSPRNG temporary password.
 * 2. Separately dispatches standard Firebase sendEmailVerification().
 * 3. Discards the temporary password immediately.
 * If account creation succeeds but sendEmailVerification fails, returns { user, emailSent: false, verificationError }
 * so the UI can offer Resend without re-creating the account.
 */
export async function startEmailVerificationRegistration(email, continueUrl) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    const trimmedEmail = email.trim();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const targetUrl = continueUrl || `${origin}/signup`;
    let tempPassword = generateCryptographicTemporaryPassword();
    let credential;
    try {
        credential = await createUserWithEmailAndPassword(auth, trimmedEmail, tempPassword);
    }
    finally {
        tempPassword = "";
    }
    try {
        await sendEmailVerification(credential.user, {
            url: targetUrl,
            handleCodeInApp: false,
        });
        return { user: credential.user, emailSent: true, verificationError: null };
    }
    catch (verificationError) {
        return { user: credential.user, emailSent: false, verificationError };
    }
}

/**
 * Resend standard Firebase verification email for the currently signed-in unverified user.
 */
export async function resendVerificationEmailForCurrentUser(continueUrl) {
    if (!auth || !auth.currentUser)
        throw new Error("No authenticated user found.");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const targetUrl = continueUrl || `${origin}/signup`;
    await sendEmailVerification(auth.currentUser, {
        url: targetUrl,
        handleCodeInApp: false,
    });
}

/**
 * Confirm email verification using fresh Firebase Auth state:
 * 1. reload() the Firebase user
 * 2. confirm emailVerified === true
 * 3. force-refresh ID token via getIdTokenResult(true)
 * 4. confirm claims.email_verified === true
 * Never unlocks unless both agree.
 */
export async function confirmVerifiedEmailAndRefreshToken() {
    if (!auth || !auth.currentUser) {
        return { verified: false, user: null, emailVerified: false, tokenVerified: false };
    }
    await auth.currentUser.reload();
    const refreshedUser = auth.currentUser;
    if (!refreshedUser || refreshedUser.emailVerified !== true) {
        return { verified: false, user: refreshedUser || null, emailVerified: false, tokenVerified: false };
    }
    const tokenResult = await refreshedUser.getIdTokenResult(true);
    const tokenVerified = tokenResult?.claims?.email_verified === true;
    return {
        verified: Boolean(refreshedUser.emailVerified === true && tokenVerified),
        user: refreshedUser,
        emailVerified: true,
        tokenVerified,
    };
}

/**
 * Apply Firebase email verification OOB action code and refresh verification state.
 */
export async function applyVerificationOobCode(oobCode) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    await applyActionCode(auth, oobCode);
    return await confirmVerifiedEmailAndRefreshToken();
}

/**
 * Send passwordless email link for verification-first registration.
 * Stores email in localStorage for seamless one-browser link consumption.
 */
export async function sendRegistrationEmailLink(email, continueUrl) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const targetUrl = continueUrl || `${origin}/signup?mode=verifyEmailLink`;
    const actionCodeSettings = {
        url: targetUrl,
        handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email.trim(), actionCodeSettings);
    if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("emailForSignIn", email.trim());
    }
}
/**
 * Check whether the current URL contains a valid email sign-in link.
 */
export function isEmailSignInLink(href) {
    if (!auth)
        return false;
    const url = href || (typeof window !== "undefined" ? window.location.href : "");
    return isSignInWithEmailLink(auth, url);
}
/**
 * Sign in using email link to establish authenticated session and verified email.
 */
export async function signInWithRegistrationLink(email, href) {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    const url = href || (typeof window !== "undefined" ? window.location.href : "");
    const storedEmail = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("emailForSignIn") : null;
    const effectiveEmail = email?.trim() || storedEmail?.trim();
    if (!effectiveEmail) {
        throw new Error("Email address is required to complete verification.");
    }
    const credential = await signInWithEmailLink(auth, effectiveEmail, url);
    if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem("emailForSignIn");
    }
    return credential.user;
}
/**
 * Sets password for currently authenticated user (strictly in-memory).
 */
export async function setUserPassword(password) {
    if (!auth || !auth.currentUser)
        throw new Error("No authenticated user session found.");
    await updatePassword(auth.currentUser, password);
}
/**
 * Checks whether user has an existing Firestore user profile document.
 */
export async function checkUserRegistrationStatus(uid) {
    if (!uid)
        return { isRegistered: false, profile: null };
    const profile = await getUserProfile(uid);
    return {
        isRegistered: Boolean(profile && profile.createdAt),
        profile,
    };
}
