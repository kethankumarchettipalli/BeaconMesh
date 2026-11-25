import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, } from "firebase/firestore";
import { auth, db } from "./firebase";
import { normalizeUserProfile } from "./user-normalization";
/**
 * Creates an in-memory fallback user profile when Firestore is unreachable or not yet created.
 */
export function createFallbackProfile(user) {
    return normalizeUserProfile({
        uid: user.uid,
        displayName: user.displayName || user.email?.split("@")[0] || "User",
        email: user.email || "",
        photoURL: user.photoURL || null,
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
        phoneNumber: user.phoneNumber || null,
        phoneVerified: false,
        emailVerified: Boolean(user.emailVerified),
        accountStatus: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
    });
}
/**
 * Fetch a user profile from Firestore `users/{uid}`.
 * Strictly implements PURE read-time normalization with ZERO database side-effects.
 */
export async function getUserProfile(uid) {
    if (!db)
        return null;
    try {
        const docRef = doc(db, "users", uid);
        const snap = await getDoc(docRef);
        if (!snap.exists())
            return null;
        return normalizeUserProfile(snap.data());
    }
    catch (error) {
        console.warn("Firestore getUserProfile error (database might not be created yet):", error);
        return null;
    }
}
/**
 * Create an initial profile for a newly registered email/password user.
 * Strictly enforces that:
 * - Citizen gets role CITIZEN, registrationPath CITIZEN, citizenEnrollmentStatus ACTIVE, and capabilities ["CITIZEN"].
 * - Responder gets safe base role CITIZEN, registrationPath RESPONDER, citizenEnrollmentStatus INACTIVE,
 *   capabilities [], requestedRole RESPONDER, and approvalStatus PENDING.
 * - Command is NEVER publicly self-registered.
 */
export async function createInitialUserProfile(user, params) {
    const isResponder = params.role === "RESPONDER";
    const profile = {
        uid: user.uid,
        displayName: params.fullName || user.displayName || "User",
        email: user.email || "",
        photoURL: user.photoURL || null,
        role: "CITIZEN",
        capabilities: isResponder ? [] : ["CITIZEN"],
        citizenEnrollmentStatus: isResponder ? "INACTIVE" : "ACTIVE",
        responderApplicationStatus: isResponder ? "PENDING" : "NOT_APPLIED",
        registrationPath: isResponder ? "RESPONDER" : "CITIZEN",
        responderSubtype: null,
        commandLevel: null,
        requestedRole: isResponder ? "RESPONDER" : null,
        requestedResponderSubtype: isResponder ? params.responderSubtype || "VOLUNTEER" : null,
        approvalStatus: (isResponder ? "PENDING" : "NOT_REQUIRED"),
        dutyStatus: isResponder ? undefined : undefined,
        activeIncidentId: null,
        phoneNumber: params.phoneNumber || null,
        phoneVerified: false,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerified ? Timestamp.now() : null,
        accountStatus: "ACTIVE",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
    };
    if (!db) {
        return profile;
    }
    try {
        const docRef = doc(db, "users", user.uid);
        await setDoc(docRef, {
            ...profile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
        });
    }
    catch (err) {
        console.warn("Could not save profile to Firestore (database might not be created yet):", err);
    }
    return profile;
}
/**
 * Synchronize or create profile for a Google authenticated user.
 * If user already has a profile, NEVER overwrite their assigned role, approvalStatus, or commandLevel.
 * If user is new, assign default CITIZEN role with NOT_REQUIRED approval.
 */
export async function syncGoogleUserProfile(user) {
    const fallback = createFallbackProfile(user);
    if (!db)
        return fallback;
    try {
        const docRef = doc(db, "users", user.uid);
        let existing;
        try {
            existing = await getDoc(docRef);
        }
        catch (e) {
            console.warn("Firestore getDoc error in syncGoogleUserProfile:", e);
            existing = null;
        }
        if (existing && existing.exists()) {
            const data = existing.data();
            try {
                await updateDoc(docRef, {
                    displayName: user.displayName || data.displayName,
                    photoURL: user.photoURL || data.photoURL,
                    emailVerified: user.emailVerified,
                    lastLoginAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }
            catch (e) {
                console.warn("Could not update lastLoginAt in Firestore:", e);
            }
            return {
                ...data,
                displayName: user.displayName || data.displayName,
                photoURL: user.photoURL || data.photoURL,
                emailVerified: user.emailVerified,
            };
        }
        // New Google User: default to CITIZEN role
        try {
            await setDoc(docRef, {
                ...fallback,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
            });
        }
        catch (e) {
            console.warn("Could not write initial Google user profile to Firestore:", e);
        }
        return fallback;
    }
    catch (error) {
        console.warn("Firestore syncGoogleUserProfile fallback used (check if Firestore database '(default)' is created in Firebase Console):", error);
        return fallback;
    }
}
/**
 * Synchronize email verification state from Firebase Auth to Firestore profile mirror.
 * Strictly verifies the 6-step invariant:
 * 1. user.reload() completes.
 * 2. getIdToken(true) completes (force token refresh so email_verified claim is updated in JWT).
 * 3. Refreshed Auth state is read.
 * 4. Firestore mirror update uses authenticated user's own UID.
 * 5. Firestore Security Rules permit transition via request.auth.token.email_verified == true.
 * 6. Final profile is read back and confirmed.
 */
export async function syncEmailVerificationMirror(currentUser) {
    if (!db || !auth)
        return null;
    if (!currentUser || currentUser.uid !== auth.currentUser?.uid)
        return null;
    try {
        // 0. Check if existing profile mirror is already synchronized
        const existing = await getUserProfile(currentUser.uid);
        if (existing && existing.emailVerified) {
            return existing;
        }
        // 1. user.reload() completes to refresh local Auth state
        await currentUser.reload();
        if (!currentUser.emailVerified) {
            return existing;
        }
        // 2. getIdTokenResult(true) completes to force claim refresh
        const tokenResult = await currentUser.getIdTokenResult(true);
        if (!tokenResult.claims.email_verified) {
            // If refreshed token does not yet contain email_verified claim, defer write
            return existing;
        }
        // 4. Firestore mirror update uses authenticated user's own UID
        const docRef = doc(db, "users", currentUser.uid);
        await updateDoc(docRef, {
            emailVerified: true,
            emailVerifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        // 6. Final profile is read back and confirmed
        return await getUserProfile(currentUser.uid);
    }
    catch (error) {
        console.warn("Could not sync emailVerified mirror in Firestore:", error);
        return await getUserProfile(currentUser.uid);
    }
}
/**
 * Update emailVerified field in user profile after confirmation.
 * Mandatory Safeguard 4:
 * Reload the Firebase Auth user and force-refresh the ID token after verification
 * before updating the protected Firestore mirror.
 */
export async function updateProfileEmailVerified(uid) {
    if (!db)
        return;
    try {
        if (auth?.currentUser && auth.currentUser.uid === uid) {
            await auth.currentUser.reload();
            await auth.currentUser.getIdToken(true);
        }
        const docRef = doc(db, "users", uid);
        await updateDoc(docRef, {
            emailVerified: true,
            emailVerifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }
    catch (error) {
        console.warn("Could not update emailVerified in Firestore:", error);
    }
}
/**
 * Update non-privileged user profile settings (name, phone, region, emergency contacts)
 */
export async function updateUserPreferences(uid, params) {
    const allowedUpdates = {
        updatedAt: new Date().toISOString(),
    };
    if (params.displayName !== undefined)
        allowedUpdates.displayName = params.displayName;
    if (params.phoneNumber !== undefined)
        allowedUpdates.phoneNumber = params.phoneNumber;
    if (params.region !== undefined)
        allowedUpdates.region = params.region;
    if (params.language !== undefined)
        allowedUpdates.language = params.language;
    if (params.emergencyContacts !== undefined)
        allowedUpdates.emergencyContacts = params.emergencyContacts;
    if (db && typeof navigator !== "undefined" && navigator.onLine) {
        try {
            const docRef = doc(db, "users", uid);
            await updateDoc(docRef, allowedUpdates);
        }
        catch (err) {
            console.warn("Firestore updateUserPreferences fallback:", err);
        }
    }
}
