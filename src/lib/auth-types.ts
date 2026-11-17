import type { Timestamp } from "firebase/firestore";

export type UserRole = "CITIZEN" | "RESPONDER" | "COMMAND";

export type ResponderSubtype = "PROFESSIONAL" | "VOLUNTEER" | null;

export type CommandLevel = "COORDINATOR" | "ADMINISTRATOR" | null;

export type ApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";

export type AccountStatus = "ACTIVE" | "SUSPENDED";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;

  role: UserRole;
  responderSubtype: ResponderSubtype;
  commandLevel: CommandLevel;

  requestedRole?: "RESPONDER" | null;
  requestedResponderSubtype?: "PROFESSIONAL" | "VOLUNTEER" | null;

  approvalStatus: ApprovalStatus;

  phoneNumber?: string | null;
  phoneVerified: false;

  emailVerified: boolean;
  accountStatus: AccountStatus;

  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  lastLoginAt?: Timestamp | string;
}

export type AuthStateStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "loading-profile"
  | "redirecting"
  | "error"
  | "authorized"
  | "email-unverified"
  | "pending-approval"
  | "suspended"
  | "INITIALIZING"
  | "UNAUTHENTICATED"
  | "AUTHENTICATED"
  | "EMAIL_UNVERIFIED"
  | "PROFILE_LOADING"
  | "AUTHORIZED"
  | "PENDING_APPROVAL"
  | "UNAUTHORIZED"
  | "SUSPENDED";

export interface SignupData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phoneNumber?: string;
  role: UserRole;
  responderSubtype?: "PROFESSIONAL" | "VOLUNTEER";
  termsAccepted: boolean;
}

export interface LoginData {
  email: string;
  password: string;
  intendedWorkspace: UserRole;
}

export const WORKSPACE_ROUTES: Record<UserRole, string> = {
  CITIZEN: "/citizen/home",
  RESPONDER: "/responder/overview",
  COMMAND: "/command/overview",
};
