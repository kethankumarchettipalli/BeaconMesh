import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, sendEmailVerification, sendPasswordResetEmail, applyActionCode, updateProfile, } from "firebase/auth";
import { auth } from "./firebase";
import { createInitialUserProfile, syncGoogleUserProfile, updateProfileEmailVerified, } from "./user-service";
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
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "Invalid email or password. Please check your credentials.";
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
 * Sign in or sign up with Google.
 * Attempts popup first; falls back to redirect if popup is blocked.
 */
export async function loginWithGoogle() {
    if (!auth)
        throw new Error("Firebase Auth is not initialized.");
    try {
        const credential = await signInWithPopup(auth, googleProvider);
        const profile = await syncGoogleUserProfile(credential.user);
        return { user: credential.user, profile };
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
 */
export async function handleAuthRedirectResult() {
    if (!auth)
        return null;
    const credential = await getRedirectResult(auth);
    if (!credential || !credential.user)
        return null;
    const profile = await syncGoogleUserProfile(credential.user);
    return { user: credential.user, profile };
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
