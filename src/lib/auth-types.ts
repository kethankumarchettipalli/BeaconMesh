import type { Timestamp } from "firebase/firestore";

export type UserRole = "CITIZEN" | "RESPONDER" | "COMMAND";

export type UserCapability = "CITIZEN" | "RESPONDER";

export type CitizenEnrollmentStatus = "ACTIVE" | "INACTIVE" | "REVOKED";

export type ResponderApplicationStatus = "NOT_APPLIED" | "PENDING" | "APPROVED" | "REJECTED";

export type RegistrationPath = "CITIZEN" | "RESPONDER";

export type ResponderDutyStatus =
  | "OFF_DUTY"
  | "AVAILABLE"
  | "DISPATCHED"
  | "ON_SCENE"
  | "UNAVAILABLE";

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
  capabilities: UserCapability[];
  citizenEnrollmentStatus: CitizenEnrollmentStatus;
  responderApplicationStatus: ResponderApplicationStatus;
  registrationPath: RegistrationPath;

  responderSubtype: ResponderSubtype;
  commandLevel: CommandLevel;

  requestedRole?: "RESPONDER" | null;
  requestedResponderSubtype?: "PROFESSIONAL" | "VOLUNTEER" | null;

  approvalStatus: ApprovalStatus;
  migrationStatus?: string;

  dutyStatus?: ResponderDutyStatus;
  activeIncidentId?: string | null;

  phoneNumber?: string | null;
  phoneVerified: boolean;

  emailVerified: boolean;
  emailVerifiedAt?: Timestamp | string | null;
  accountStatus: AccountStatus;

  reviewedBy?: string | null;
  reviewedAt?: Timestamp | string | null;
  rejectionReason?: string | null;

  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  lastLoginAt?: Timestamp | string;
}

export type AuthStateStatus =
  | "INITIALIZING"
  | "UNAUTHENTICATED"
  | "AUTHENTICATING"
  | "AUTHENTICATED"
  | "PROFILE_LOADING"
  | "EMAIL_UNVERIFIED"
  | "RESPONDER_PENDING"
  | "AUTHORIZED"
  | "UNAUTHORIZED"
  | "SUSPENDED"
  | "PROFILE_ERROR";

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

export const PENDING_RESPONDER_ROUTE = "/responder/application-pending";

export const SESSION_ROLE_KEY = "beaconmesh-session-role";

export interface RoleAuthorizationResult {
  isAuthorized: boolean;
  isPending: boolean;
  destinationRoute: string | null;
  errorMessage: string | null;
}
