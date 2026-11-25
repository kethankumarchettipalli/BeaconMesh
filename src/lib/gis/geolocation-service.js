/**
 * Geolocation Service for BeaconMesh GIS
 *
 * Implements real device geolocation with explicit user permission.
 * ZERO SYNTHETIC FALLBACK INVARIANT:
 * If geolocation is denied, times out, or unavailable, this service returns
 * an explicit failure status. It NEVER fabricates coordinates or falls back to fake GPS.
 */
export async function getDeviceLocation(options) {
    if (typeof window === "undefined" || !navigator.geolocation) {
        return {
            success: false,
            coords: null,
            error: {
                code: "NOT_SUPPORTED",
                message: "Geolocation is not supported by this browser environment.",
            },
            timestamp: Date.now(),
        };
    }
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition((position) => {
            resolve({
                success: true,
                coords: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude,
                    heading: position.coords.heading,
                    speed: position.coords.speed,
                },
                error: null,
                timestamp: position.timestamp,
            });
        }, (geoError) => {
            let code = "POSITION_UNAVAILABLE";
            if (geoError.code === geoError.PERMISSION_DENIED) {
                code = "PERMISSION_DENIED";
            }
            else if (geoError.code === geoError.TIMEOUT) {
                code = "TIMEOUT";
            }
            resolve({
                success: false,
                coords: null,
                error: {
                    code,
                    message: geoError.message || "Failed to retrieve real GPS position.",
                },
                timestamp: Date.now(),
            });
        }, {
            enableHighAccuracy: options?.enableHighAccuracy ?? true,
            timeout: options?.timeout ?? 10000,
            maximumAge: options?.maximumAge ?? 5000,
        });
    });
}
