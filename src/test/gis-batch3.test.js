import { describe, it, expect } from "vitest";
import { calculateGroundResolutionMpp, evaluateOverzoom, formatResolution, formatScaleRatio, mppToCm, } from "@/lib/gis/resolution-utils";
describe("GIS Batch 3 — CoordinateHUD, ImageryInspector, Citation & Resolution", () => {
    it("calculates latitude-adjusted Ground Sample Distance (GSD) in meters per pixel", () => {
        // At equator (lat 0) at zoom 0, earth circumference / 256
        const gsdEquatorZ0 = calculateGroundResolutionMpp(0, 0);
        expect(gsdEquatorZ0).toBeCloseTo(156543.03, 0);
        // At Vijayawada (lat ~16.5) at zoom 16
        const gsdVijayawadaZ16 = calculateGroundResolutionMpp(16.5, 16);
        // Should be approximately ~2.29 meters per pixel
        expect(gsdVijayawadaZ16).toBeGreaterThan(2.0);
        expect(gsdVijayawadaZ16).toBeLessThan(2.5);
        // At zoom 19 (optical limit)
        const gsdVijayawadaZ19 = calculateGroundResolutionMpp(16.5, 19);
        // At LOD 19, GSD should be ~0.28 to 0.35 m/px (~28-35 cm/px)
        expect(gsdVijayawadaZ19).toBeGreaterThan(0.25);
        expect(gsdVijayawadaZ19).toBeLessThan(0.35);
    });
    it("converts meters per pixel to centimeters and formats cleanly", () => {
        const cm = mppToCm(0.34);
        expect(cm).toBeCloseTo(34, 1);
        const fmtCm = formatResolution(0.24);
        expect(fmtCm.cmStr).toBe("24.0 cm/px");
        const fmtM = formatResolution(1.5);
        expect(fmtM.metersStr).toBe("1.50 m/px");
    });
    it("evaluates optical overzoom diagnostics accurately", () => {
        // Within optical limit (LOD 17 <= max 19)
        const optDiag = evaluateOverzoom(17, 19);
        expect(optDiag.isOverzoomed).toBe(false);
        expect(optDiag.overzoomFactor).toBe(1);
        // Overzoomed at LOD 21 (2 levels beyond LOD 19 = 4x factor)
        const overDiag = evaluateOverzoom(21, 19);
        expect(overDiag.isOverzoomed).toBe(true);
        expect(overDiag.overzoomLevels).toBe(2);
        expect(overDiag.overzoomFactor).toBe(4);
        expect(overDiag.diagnostic).toContain("Digitally overzoomed (4.0x resampled)");
    });
    it("formats scale ratios in standard cartographic representation", () => {
        expect(formatScaleRatio(18056)).toBe("1:18,056");
        expect(formatScaleRatio(1128)).toBe("1:1,128");
        expect(formatScaleRatio(0)).toBe("1:--");
    });
});
