/**
 * GIS Resolution & Scale Calculations
 *
 * Implements latitude-adjusted Ground Sample Distance (GSD) in Web Mercator,
 * representative scale ratios, and optical overzoom diagnostics.
 */
const EARTH_EQUATORIAL_CIRCUMFERENCE_METERS = 40075016.68557849;
const TILE_SIZE_PIXELS = 256;
const METERS_PER_INCH = 0.0254;
const DEFAULT_SCREEN_DPI = 96;
/**
 * Calculates ground sample distance (GSD / resolution) in meters per pixel
 * at a given latitude and zoom level in standard Web Mercator.
 */
export function calculateGroundResolutionMpp(latitude, zoom) {
    if (zoom < 0)
        return 0;
    const latRad = (latitude * Math.PI) / 180;
    const initialResolution = EARTH_EQUATORIAL_CIRCUMFERENCE_METERS / TILE_SIZE_PIXELS;
    return (initialResolution * Math.cos(latRad)) / Math.pow(2, zoom);
}
/**
 * Converts meters per pixel to centimeters per pixel
 */
export function mppToCm(mpp) {
    return mpp * 100;
}
/**
 * Calculates representative map scale from ground resolution (m/px) and screen DPI
 */
export function resolutionToScale(resolutionMpp, dpi = DEFAULT_SCREEN_DPI) {
    return resolutionMpp * (dpi / METERS_PER_INCH);
}
/**
 * Formats ground resolution nicely for GIS display
 */
export function formatResolution(mpp) {
    if (mpp <= 0 || !Number.isFinite(mpp)) {
        return { metersStr: "Unavailable", cmStr: "Unavailable", summary: "Resolution unavailable" };
    }
    const cm = mpp * 100;
    let metersStr;
    let cmStr;
    if (mpp >= 1000) {
        metersStr = `${(mpp / 1000).toFixed(2)} km/px`;
        cmStr = `${(cm / 100000).toFixed(2)} km/px`;
    }
    else if (mpp >= 1) {
        metersStr = `${mpp.toFixed(2)} m/px`;
        cmStr = `${cm.toFixed(0)} cm/px`;
    }
    else {
        metersStr = `${mpp.toFixed(3)} m/px`;
        cmStr = `${cm.toFixed(1)} cm/px`;
    }
    const summary = cm < 100 ? `${cm.toFixed(1)} cm/px (${mpp.toFixed(2)} m/px)` : `${mpp.toFixed(2)} m/px`;
    return { metersStr, cmStr, summary };
}
/**
 * Formats map scale ratio e.g. 1:1,128 or 1:50,000
 */
export function formatScaleRatio(scale) {
    if (!scale || !Number.isFinite(scale) || scale <= 0)
        return "1:--";
    return `1:${Math.round(scale).toLocaleString()}`;
}
/**
 * Checks if current view zoom level is within native source imagery resolution
 * or whether it is digitally overzoomed beyond the native source cache.
 */
export function evaluateOverzoom(currentZoom, maxMapLevel) {
    const maxNativeLevel = typeof maxMapLevel === "number" && maxMapLevel > 0 ? maxMapLevel : 19;
    const roundedZoom = Math.round(currentZoom * 10) / 10;
    if (roundedZoom > maxNativeLevel) {
        const diff = roundedZoom - maxNativeLevel;
        const factor = Math.pow(2, diff);
        return {
            isOverzoomed: true,
            overzoomLevels: Math.round(diff * 10) / 10,
            overzoomFactor: Math.round(factor * 10) / 10,
            diagnostic: `Digitally overzoomed (${factor.toFixed(1)}x resampled). Native source detail terminates at LOD ${maxNativeLevel}. Further zooming enlarges pixels without extracting new optical details.`,
        };
    }
    return {
        isOverzoomed: false,
        overzoomLevels: 0,
        overzoomFactor: 1,
        diagnostic: `Native source resolution active (LOD ${roundedZoom} ≤ max native LOD ${maxNativeLevel}).`,
    };
}
