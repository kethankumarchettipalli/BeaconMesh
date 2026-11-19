/**
 * Canonical Data Models for BeaconMesh
 *
 * Implements strict types, enums, and validation functions for:
 * - Users & Responder Profiles
 * - Incidents & Locations
 * - Teams & Assignments
 * - Safe Zones (Focused on Vijayawada, Andhra Pradesh, India)
 * - Messages & Notifications
 * - Offline Outbox & Synchronization
 */

import type {
  UserRole,
  UserCapability,
  ResponderSubtype,
  CommandLevel,
  AccountStatus,
  ApprovalStatus,
  ResponderDutyStatus,
} from "../auth-types";

// ============================================================================
// 1. INCIDENTS & LOCATION
// ============================================================================

export type IncidentCategory =
  | "Medical"
  | "Trapped"
  | "Fire"
  | "Flood"
  | "Accident"
  | "Structural"
  | "Utility"
  | "Other";

export type IncidentSeverity = "Critical" | "High" | "Moderate" | "Low";

export type IncidentStatus =
  | "Saved on device"         // Local-only, not yet synced
  | "Waiting for connection"  // Queued in outbox, awaiting network
  | "Acknowledged"            // Dispatched & acknowledged by responder/command
  | "In progress"             // Responder actively on scene
  | "Resolved"                // Incident closed
  | "Cancelled";              // Withdrawn by citizen or marked duplicate

export type LocationSource = "GPS" | "MANUAL" | "UNAVAILABLE";

export interface IncidentLocation {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number | null;
  source: LocationSource;
  addressLabel?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
}

export type SyncStatus =
  | "LOCAL_ONLY"
  | "PENDING_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "SYNC_FAILED";

export interface IncidentRecord {
  id: string;                         // Stable identifier, e.g. "BM-2611-9481"
  reporterId: string;                 // Auth UID of reporting citizen (or 'createdBy')
  createdBy?: string;                 // Firestore field alias for rule parity
  reporterNameSnapshot?: string;      // Non-sensitive display name at creation
  reporterContact?: string;           // Optional contact info for response team
  category: IncidentCategory;         // Canonical UI category
  type?: string;                      // Firestore field alias for rule parity
  title: string;
  description: string;
  severity: IncidentSeverity;         // Canonical UI severity
  priority?: string;                  // Firestore field alias for rule parity
  status: IncidentStatus;
  location: IncidentLocation;
  place?: string;                     // Firestore field alias for rule parity
  assignedResponderIds: string[];     // UIDs of assigned responders
  assignedResponderId?: string | null;// Firestore field alias for single responder
  assignedTeamId?: string;
  notes?: string | null;
  resolutionDetails?: string;
  resolvedAt?: string;                // ISO 8601 string
  source?: "CITIZEN_APP" | "OFFLINE_MESH" | "DISPATCH";
  syncStatus: SyncStatus;             // Offline-first delivery status
  createdAt: string;                  // ISO 8601 string
  updatedAt: string;                  // ISO 8601 string
}

// ============================================================================
// 2. SAFE ZONES (Indian Civic & Disaster Relief Infrastructure)
// ============================================================================

export type SafeZoneOperationalStatus = "OPEN" | "CLOSED" | "UNKNOWN" | "LIMITED" | "FULL";
export type SafeZoneVerificationStatus = "VERIFIED" | "UNVERIFIED";

export interface SafeZoneLocation {
  latitude: number;
  longitude: number;
  address?: string;
  locality?: string;
  city: string;
  district: string;
  state: string;
  country: "India";
}

export interface SafeZoneRecord {
  id: string;                         // e.g. "sz-vja-igmc-stadium"
  name: string;
  description?: string;
  location: SafeZoneLocation;
  facilities: string[];               // e.g. ["Shelter", "Medical", "Drinking Water", "Generator Power"]
  capacity?: number;
  availableCapacity?: number;
  operationalStatus: SafeZoneOperationalStatus;
  verificationStatus: SafeZoneVerificationStatus;
  sourceName?: string;                // e.g. "Vijayawada Municipal Corporation (VMC)"
  sourceReference?: string;           // e.g. "APSDMA Relief Center Index 2026"
  verifiedBy?: string;                // Coordinator / Administrator UID
  verifiedAt?: string;                // ISO 8601
  updatedAt: string;                  // ISO 8601
}

// ============================================================================
// 3. RESPONDER PROFILES & ASSIGNMENTS
// ============================================================================

export type ResponderAvailabilityStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "BUSY"
  | "DEPLOYED";

export interface ResponderProfileRecord {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  responderSubtype: ResponderSubtype;
  availabilityStatus: ResponderAvailabilityStatus;
  dutyStatus?: ResponderDutyStatus;
  operationalStatus: string;           // Freeform field note, e.g. "Stationed at Benz Circle"
  currentLocation?: IncidentLocation;  // Deprecated in favor of separate responderLocations collection
  skills: string[];                    // e.g. ["First Aid", "Water Rescue", "Radio Mesh"]
  teamId?: string;
  activeIncidentId?: string | null;
  updatedAt: string;
}

/**
 * Isolated live telemetry document in `responderLocations/{uid}`.
 * Strictly separate from `users` and `responderProfiles` to guarantee location privacy
 * and server-side rules enforcement.
 */
export interface ResponderLocationRecord {
  uid: string;
  dutyStatus: ResponderDutyStatus;
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracyMeters?: number | null;
  activeIncidentId?: string | null;
  updatedAt: string;
}

export type AssignmentStatus =
  | "ASSIGNED"
  | "ACKNOWLEDGED"
  | "EN_ROUTE"
  | "ON_SCENE"
  | "COMPLETED"
  | "CANCELLED";

export interface IncidentAssignmentRecord {
  id: string;
  incidentId: string;
  responderId: string;
  responderName?: string;
  assignedBy: string;                 // Command Coordinator UID
  assignmentStatus: AssignmentStatus;
  assignedAt: string;
  updatedAt: string;
  notes?: string;
}

// ============================================================================
// 4. TEAMS & RESPONDER APPLICATIONS
// ============================================================================

export interface TeamRecord {
  id: string;
  name: string;
  callsign: string;
  leadResponderId: string;
  memberIds: string[];
  operationalArea: string;
  activeStatus: "ACTIVE" | "STANDBY" | "OFF_DUTY";
  updatedAt: string;
}

export interface ResponderApplicationRecord {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  requestedSubtype: ResponderSubtype;
  qualifications: string[];
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

// ============================================================================
// 5. MESSAGES & NOTIFICATIONS
// ============================================================================

export interface UserMessageRecord {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  messageType: "ALERT" | "COORDINATION" | "DIRECT";
  status: "SENT" | "DELIVERED" | "READ";
  createdAt: string;
}

export type NotificationType =
  | "DISPATCH_ALERT"
  | "STATUS_CHANGE"
  | "SAFE_ZONE_UPDATE"
  | "NETWORK_RESTORED"
  | "APPROVAL_UPDATE";

export interface NotificationRecord {
  id: string;
  recipientId: string;
  title: string;
  body: string;
  notificationType: NotificationType;
  relatedEntityId?: string;
  read: boolean;
  createdAt: string;
}

// ============================================================================
// 6. OFFLINE OUTBOX MUTATIONS
// ============================================================================

export type OutboxActionType =
  | "CREATE_INCIDENT"
  | "UPDATE_INCIDENT_STATUS"
  | "ASSIGN_INCIDENT"
  | "UPDATE_RESPONDER_AVAILABILITY"
  | "CREATE_SAFE_ZONE"
  | "UPDATE_SAFE_ZONE"
  | "CREATE_MESSAGE"
  | "UPDATE_USER_PROFILE";

export interface OutboxItem {
  id: string;                         // Unique mutation ID
  actionType: OutboxActionType;
  collection: string;                 // Target Firestore collection
  docId: string;                      // Target Firestore document ID
  payload: Record<string, unknown>;   // Exact document payload to commit
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  createdAt: string;
}

// ============================================================================
// 7. RUNTIME VALIDATION HELPERS
// ============================================================================

export function validateIncidentPayload(data: Partial<IncidentRecord>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const reporterId = data.reporterId || data.createdBy;
  if (!reporterId || reporterId.trim().length === 0) {
    errors.push("Authenticated reporter ID is required.");
  }

  const category = data.category || (data.type as IncidentCategory);
  if (!category) {
    errors.push("Incident category is required.");
  }

  if (!data.description || data.description.trim().length < 5) {
    errors.push("Description must be at least 5 characters.");
  }
  if (data.description && data.description.length > 2000) {
    errors.push("Description must not exceed 2000 characters.");
  }

  // Location validation
  if (data.location) {
    const { latitude, longitude, source } = data.location;
    if (source !== "UNAVAILABLE") {
      if (typeof latitude !== "number" || isNaN(latitude) || latitude < -90 || latitude > 90) {
        errors.push("Invalid latitude: must be between -90 and 90.");
      }
      if (typeof longitude !== "number" || isNaN(longitude) || longitude < -180 || longitude > 180) {
        errors.push("Invalid longitude: must be between -180 and 180.");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateSafeZonePayload(data: Partial<SafeZoneRecord>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.name || data.name.trim().length < 3) {
    errors.push("Safe zone name must be at least 3 characters.");
  }
  if (!data.location) {
    errors.push("Safe zone location is required.");
  } else {
    const { latitude, longitude, city, state, country } = data.location;
    if (typeof latitude !== "number" || isNaN(latitude) || latitude < 8 || latitude > 38) {
      errors.push("Latitude must be a valid coordinate within India (8 to 38 deg N).");
    }
    if (typeof longitude !== "number" || isNaN(longitude) || longitude < 68 || longitude > 98) {
      errors.push("Longitude must be a valid coordinate within India (68 to 98 deg E).");
    }
    if (!city || city.trim().length === 0) {
      errors.push("City name is required (e.g. Vijayawada).");
    }
    if (!state || state.trim().length === 0) {
      errors.push("State name is required (e.g. Andhra Pradesh).");
    }
    if (country !== "India") {
      errors.push("Safe zone country must be 'India'.");
    }
  }

  if (data.capacity !== undefined && (typeof data.capacity !== "number" || data.capacity < 0)) {
    errors.push("Capacity must be a non-negative number.");
  }

  return { valid: errors.length === 0, errors };
}

export function validateMessagePayload(data: Partial<UserMessageRecord>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.senderId) errors.push("Sender ID is required.");
  if (!data.content || data.content.trim().length === 0) errors.push("Message content cannot be empty.");
  if (data.content && data.content.length > 1000) errors.push("Message cannot exceed 1000 characters.");
  return { valid: errors.length === 0, errors };
}
