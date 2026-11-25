/**
 * Esri World Imagery Citation & Resolution Metadata Service
 *
 * Queries Layer 4 of the World_Imagery service for authentic source citations,
 * sensor type, acquisition dates, native resolution (GSD), and footprint boundaries.
 */
const CITATION_ENDPOINT = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/4/query";
const citationCache = new Map();
let activeController = null;
function formatDateInt(val) {
    if (typeof val !== "number" || !val)
        return "Unavailable";
    const s = val.toString();
    if (s.length === 8) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    return s;
}
export async function queryImageryCitation(lat, lng) {
    // Round to ~100m cache grid
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (citationCache.has(key)) {
        return citationCache.get(key) || null;
    }
    if (activeController) {
        activeController.abort();
    }
    activeController = new AbortController();
    const params = new URLSearchParams({
        geometry: `${lng},${lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "*",
        returnGeometry: "false",
        f: "json",
    });
    try {
        const res = await fetch(`${CITATION_ENDPOINT}?${params.toString()}`, {
            signal: activeController.signal,
        });
        if (!res.ok) {
            citationCache.set(key, null);
            return null;
        }
        const data = await res.json();
        if (!data.features || data.features.length === 0) {
            citationCache.set(key, null);
            return null;
        }
        const attrs = data.features[0].attributes;
        const resM = typeof attrs.SRC_RES === "number" && attrs.SRC_RES > 0 ? attrs.SRC_RES : null;
        const record = {
            objectid: Number(attrs.OBJECTID) || 0,
            sourceName: attrs.NICE_NAME || attrs.SRC_DESC || "Unavailable",
            provider: attrs.NICE_DESC || attrs.SOURCE || "Unavailable",
            acquisitionDate: formatDateInt(attrs.SRC_DATE),
            nativeResolutionMeters: resM,
            nativeResolutionFormatted: resM ? `${resM.toFixed(2)} m/px` : "Unavailable",
            accuracyMeters: typeof attrs.SRC_ACC === "number" ? attrs.SRC_ACC : null,
            minMapLevel: Number(attrs.MinMapLevel) || 0,
            maxMapLevel: Number(attrs.MaxMapLevel) || 19,
            description: attrs.SRC_DESC || "Unavailable",
        };
        citationCache.set(key, record);
        return record;
    }
    catch (err) {
        if (err?.name === "AbortError")
            return null;
        citationCache.set(key, null);
        return null;
    }
}
