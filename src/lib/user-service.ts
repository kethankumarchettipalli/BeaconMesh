import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type {
  UserProfile,
  UserRole,
  ResponderSubtype,
  ApprovalStatus,
} from "./auth-types";

/**
 * Creates an in-memory fallback user profile when Firestore is unreachable or not yet created.
 */
export function createFallbackProfile(user: User): UserProfile {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "User",
    email: user.email || "",
    photoURL: user.photoURL || null,

    role: "CITIZEN",
    responderSubtype: null,
    commandLevel: null,

    requestedRole: null,
    requestedResponderSubtype: null,

    approvalStatus: "NOT_REQUIRED",

    phoneNumber: user.phoneNumber || null,
    phoneVerified: false,

    emailVerified: user.emailVerified,
    accountStatus: "ACTIVE",

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
}

/**
 * Fetch a user profile from Firestore `users/{uid}`.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  try {
    const docRef = doc(db, "users", uid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    console.warn("Firestore getUserProfile error (database might not be created yet):", error);
    return null;
  }
}

/**
 * Create an initial profile for a newly registered email/password user.
 * Strictly enforces that:
 * - Citizen gets role CITIZEN and approval NOT_REQUIRED.
 * - Responder gets safe base role CITIZEN with requestedRole RESPONDER,
 *   requestedResponderSubtype, and approvalStatus PENDING.
 * - Command is NEVER publicly self-registered.
 */
export async function createInitialUserProfile(
  user: User,
  params: {
    fullName: string;
    phoneNumber?: string;
    role: UserRole;
    responderSubtype?: ResponderSubtype;
  },
): Promise<UserProfile> {
  const isResponder = params.role === "RESPONDER";

  const profile: UserProfile = {
    uid: user.uid,
    displayName: params.fullName || user.displayName || "User",
    email: user.email || "",
    photoURL: user.photoURL || null,

    role: "CITIZEN",
    responderSubtype: null,
    commandLevel: null,

    requestedRole: isResponder ? "RESPONDER" : null,
    requestedResponderSubtype: isResponder ? params.responderSubtype || "VOLUNTEER" : null,

    approvalStatus: (isResponder ? "PENDING" : "NOT_REQUIRED") as ApprovalStatus,

    phoneNumber: params.phoneNumber || null,
    phoneVerified: false,

    emailVerified: user.emailVerified,
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
  } catch (err) {
    console.warn("Could not save profile to Firestore (database might not be created yet):", err);
  }

  return profile;
}

/**
 * Synchronize or create profile for a Google authenticated user.
 * If user already has a profile, NEVER overwrite their assigned role, approvalStatus, or commandLevel.
 * If user is new, assign default CITIZEN role with NOT_REQUIRED approval.
 */
export async function syncGoogleUserProfile(user: User): Promise<UserProfile> {
  const fallback = createFallbackProfile(user);
  if (!db) return fallback;

  try {
    const docRef = doc(db, "users", user.uid);
    let existing;
    try {
      existing = await getDoc(docRef);
    } catch (e) {
      console.warn("Firestore getDoc error in syncGoogleUserProfile:", e);
      existing = null;
    }

    if (existing && existing.exists()) {
      const data = existing.data() as UserProfile;
      try {
        await updateDoc(docRef, {
          displayName: user.displayName || data.displayName,
          photoURL: user.photoURL || data.photoURL,
          emailVerified: user.emailVerified,
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
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
    } catch (e) {
      console.warn("Could not write initial Google user profile to Firestore:", e);
    }

    return fallback;
  } catch (error) {
    console.warn(
      "Firestore syncGoogleUserProfile fallback used (check if Firestore database '(default)' is created in Firebase Console):",
      error,
    );
    return fallback;
  }
}

/**
 * Update emailVerified field in user profile after confirmation.
 */
export async function updateProfileEmailVerified(uid: string): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, {
      emailVerified: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("Could not update emailVerified in Firestore:", error);
  }
}
