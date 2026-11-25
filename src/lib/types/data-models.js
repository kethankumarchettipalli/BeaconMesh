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
// ============================================================================
// 7. RUNTIME VALIDATION HELPERS
// ============================================================================
export function validateIncidentPayload(data) {
    const errors = [];
    const reporterId = data.reporterId || data.createdBy;
    if (!reporterId || reporterId.trim().length === 0) {
        errors.push("Authenticated reporter ID is required.");
    }
    const category = data.category || data.type;
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
export function validateSafeZonePayload(data) {
    const errors = [];
    if (!data.name || data.name.trim().length < 3) {
        errors.push("Safe zone name must be at least 3 characters.");
    }
    if (!data.location) {
        errors.push("Safe zone location is required.");
    }
    else {
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
export function validateMessagePayload(data) {
    const errors = [];
    if (!data.senderId)
        errors.push("Sender ID is required.");
    if (!data.content || data.content.trim().length === 0)
        errors.push("Message content cannot be empty.");
    if (data.content && data.content.length > 1000)
        errors.push("Message cannot exceed 1000 characters.");
    return { valid: errors.length === 0, errors };
}
