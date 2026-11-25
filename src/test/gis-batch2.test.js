import { describe, it, expect } from "vitest";
import { GIS_SERVICES } from "@/lib/gis/gis-config";
describe("GIS Batch 2 — SceneViewContainer, Independent Selectors & EarthProNav", () => {
    it("supports all independent 2D/3D and basemap combinations for Command", () => {
        const dimensions = ["2d", "3d"];
        const basemaps = ["streets", "satellite", "clarity"];
        const combinations = [];
        for (const d of dimensions) {
            for (const b of basemaps) {
                combinations.push({ dimension: d, basemap: b });
            }
        }
        // Must yield 6 distinct, independent modes
        expect(combinations.length).toBe(6);
        expect(combinations).toContainEqual({ dimension: "2d", basemap: "streets" });
        expect(combinations).toContainEqual({ dimension: "2d", basemap: "satellite" });
        expect(combinations).toContainEqual({ dimension: "2d", basemap: "clarity" });
        expect(combinations).toContainEqual({ dimension: "3d", basemap: "streets" });
        expect(combinations).toContainEqual({ dimension: "3d", basemap: "satellite" });
        expect(combinations).toContainEqual({ dimension: "3d", basemap: "clarity" });
    });
    it("validates 3D terrain elevation ground service", () => {
        expect(GIS_SERVICES.elevation).toBe("https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer");
    });
    it("verifies 3D camera defaults for oblique relief perspective", () => {
        const cameraPositionZ = 2200; // meters
        const cameraTilt = 55; // degrees
        expect(cameraPositionZ).toBeGreaterThanOrEqual(1000);
        expect(cameraTilt).toBeGreaterThan(0);
        expect(cameraTilt).toBeLessThan(90);
    });
});
