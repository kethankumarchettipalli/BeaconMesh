import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, } from "firebase/firestore";
import { auth, db } from "./firebase";
import { normalizeUserProfile } from "./user-normalization";
/**
 * Validate that a Firestore profile document contains the necessary core structural fields.
 */
export function isValidProfileStructure(profile) {
    if (!profile || typeof profile !== "object")
        return false;
    if (typeof profile.uid !== "string" || profile.uid.trim().length === 0)
        return false;
    if (typeof profile.email !== "string")
        return false;
    if (!["CITIZEN", "RESPONDER", "COMMAND"].includes(profile.role))
        return false;
    if (!["ACTIVE", "SUSPENDED"].includes(profile.accountStatus))
        return false;
    if (!["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"].includes(profile.approvalStatus))
        return false;
    if (!Array.isArray(profile.capabilities))
        return false;
    return true;
}
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
        region: null,
        district: null,
        city: null,
        organization: null,
        requestedUnit: null,
        designation: null,
        experienceYears: null,
        credentialsSummary: null,
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
    if (!db || !uid)
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
        throw error;
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
    if (params.role === "COMMAND") {
        throw new Error("Command accounts cannot be created via public registration.");
    }
    if (!user?.emailVerified) {
        const err = new Error("Email verification is required before creating a user profile.");
        err.code = "auth/email-unverified";
        throw err;
    }
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
        dutyStatus: null,
        activeIncidentId: null,
        phoneNumber: params.phoneNumber || null,
        phoneVerified: false,
        emailVerified: Boolean(user.emailVerified),
        emailVerifiedAt: user.emailVerified ? Timestamp.now() : null,
        accountStatus: "ACTIVE",
        region: params.region || null,
        district: params.district || null,
        city: params.city || null,
        organization: isResponder ? (params.organization || null) : null,
        requestedUnit: isResponder ? (params.requestedUnit || null) : null,
        designation: isResponder ? (params.designation || null) : null,
        experienceYears: isResponder && params.experienceYears != null && params.experienceYears !== "" ? Number(params.experienceYears) : null,
        credentialsSummary: isResponder ? (params.credentialsSummary || null) : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
    };
    if (!db) {
        return profile;
    }
    const docRef = doc(db, "users", user.uid);
    const existing = await getDoc(docRef);
    if (existing.exists()) {
        return normalizeUserProfile(existing.data());
    }
    await setDoc(docRef, {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
    });
    const confirmed = await getDoc(docRef);
    if (!confirmed.exists()) {
        throw new Error("Profile creation could not be confirmed in Firestore.");
    }
    return normalizeUserProfile(confirmed.data());
}
/**
 * Synchronize profile timestamps and display metadata for an existing Google-authenticated user.
 * Strictly enforces:
 * - Existing account required (returns null if profile does not exist in Firestore; NO self-registration).
 * - Never overwrites assigned role, commandLevel, approvalStatus, or capabilities.
 * - Never overwrites emailVerified mirror (preserves canonical BeaconMesh profile state).
 * - Updates only displayName, photoURL, lastLoginAt, and updatedAt.
 */
export async function syncGoogleUserProfile(user) {
    if (!db || !user?.uid)
        return null;
    try {
        const docRef = doc(db, "users", user.uid);
        const existing = await getDoc(docRef);
        if (!existing.exists()) {
            return null;
        }
        const data = existing.data();
        const updates = {
            displayName: user.displayName || data.displayName || "User",
            photoURL: user.photoURL || data.photoURL || null,
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        try {
            await updateDoc(docRef, updates);
        }
        catch (e) {
            console.warn("Could not update lastLoginAt in Firestore:", e);
        }
        return normalizeUserProfile({
            ...data,
            ...updates,
        });
    }
    catch (error) {
        console.warn("Firestore syncGoogleUserProfile error:", error);
        throw error;
    }
}
/**
 * Synchronize email-verification mirror (SEC-MIR-01).
 *
 * Permitted transition: emailVerified false → true only.
 * Requirements:
 *   1. caller == auth.currentUser (identity guard).
 *   2. user.reload() to refresh in-memory Auth state.
 *   3. getIdTokenResult(true) to force JWT refresh so email_verified claim is fresh.
 *   4. Only proceed if the refreshed JWT carries email_verified == true.
 *   5. Write exactly {emailVerified, emailVerifiedAt, updatedAt} with serverTimestamp().
 *      (Firestore rule isValidUserEmailVerificationUpdate enforces these same constraints.)
 *   6. Re-read and return the confirmed profile.
 *   7. On any failure, THROW — do NOT silently pretend the mirror was updated.
 *      Callers must handle the error and surface a diagnostic to the user.
 */
export async function syncEmailVerificationMirror(currentUser) {
    if (!db || !auth)
        throw new Error("Firebase is not initialized.");
    if (!currentUser || currentUser.uid !== auth.currentUser?.uid)
        throw new Error("Caller mismatch: supplied user does not match authenticated session.");
    // 0. Fast-path: profile mirror already synchronized.
    const existing = await getUserProfile(currentUser.uid);
    if (existing && existing.emailVerified) {
        return existing;
    }
    // 1. Reload Auth state to pick up any email verification completed in another tab/session.
    await currentUser.reload();
    const refreshedUser = auth.currentUser;
    if (!refreshedUser || !refreshedUser.emailVerified) {
        // Firebase Auth itself does not yet consider the email verified.
        const err = new Error("Email is not yet verified in Firebase Authentication.");
        err.code = "auth/email-unverified";
        throw err;
    }
    // 2 & 3. Force JWT refresh so the email_verified claim inside the token is current.
    const tokenResult = await refreshedUser.getIdTokenResult(true);
    if (!tokenResult.claims.email_verified) {
        // The refreshed token still does not carry email_verified. This can occur during
        // token propagation delay. Caller should retry after a short pause.
        const err = new Error("Firebase token not yet updated with email_verified claim. Please retry shortly.");
        err.code = "auth/token-not-yet-verified";
        throw err;
    }
    // 4 & 5. Write the mirror update. Firestore rule isValidUserEmailVerificationUpdate
    // independently validates: diff == {emailVerified, emailVerifiedAt, updatedAt},
    // token.email_verified == true, prev.emailVerified == false, timestamps == request.time.
    const docRef = doc(db, "users", refreshedUser.uid);
    try {
        await updateDoc(docRef, {
            emailVerified: true,
            emailVerifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }
    catch (writeErr) {
        // Surface Firestore write failures as actionable errors — never swallow.
        const err = new Error(
            `Mirror write rejected by Firestore (${writeErr?.code || writeErr?.message}). ` +
            "Ensure the account exists and is ACTIVE."
        );
        err.code = writeErr?.code || "auth/mirror-write-failed";
        err.cause = writeErr;
        throw err;
    }
    // 6. Re-read to confirm the write was accepted and return the authoritative profile.
    const confirmed = await getUserProfile(refreshedUser.uid);
    if (!confirmed || !confirmed.emailVerified) {
        const err = new Error(
            "Mirror write appeared to succeed but re-read profile still shows emailVerified:false. " +
            "The Firestore rule may have rejected the update silently — check emulator logs."
        );
        err.code = "auth/mirror-verify-failed";
        throw err;
    }
    return confirmed;
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
