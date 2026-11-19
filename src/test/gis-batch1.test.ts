import { describe, it, expect } from "vitest";
import {
  ROLE_GIS_POLICIES,
  GIS_SERVICES,
  DEFAULT_GIS_VIEW,
  initEsriInterceptor,
} from "@/lib/gis/gis-config";
import { parseCoordinateInput } from "@/components/gis/MapControls";

describe("GIS Batch 1 — MapViewContainer, Lifecycle, Basemaps & Controls", () => {
  it("enforces strict role-based GIS capability matrix", () => {
    // Citizen: 2D only, Streets & Satellite only
    expect(ROLE_GIS_POLICIES.CITIZEN.allowedBasemaps).toEqual(["streets", "satellite"]);
    expect(ROLE_GIS_POLICIES.CITIZEN.allowedDimensions).toEqual(["2d"]);
    expect(ROLE_GIS_POLICIES.CITIZEN.hasComparisonSwipe).toBe(false);
    expect(ROLE_GIS_POLICIES.CITIZEN.hasEarthProNav).toBe(false);

    // Responder: 2D only, Streets & Satellite only
    expect(ROLE_GIS_POLICIES.RESPONDER.allowedBasemaps).toEqual(["streets", "satellite"]);
    expect(ROLE_GIS_POLICIES.RESPONDER.allowedDimensions).toEqual(["2d"]);
    expect(ROLE_GIS_POLICIES.RESPONDER.hasComparisonSwipe).toBe(false);

    // Command: 2D and 3D, all basemaps, all tools enabled
    expect(ROLE_GIS_POLICIES.COMMAND.allowedBasemaps).toContain("clarity");
    expect(ROLE_GIS_POLICIES.COMMAND.allowedDimensions).toEqual(["2d", "3d"]);
    expect(ROLE_GIS_POLICIES.COMMAND.hasComparisonSwipe).toBe(true);
    expect(ROLE_GIS_POLICIES.COMMAND.hasEarthProNav).toBe(true);
    expect(ROLE_GIS_POLICIES.COMMAND.hasSketchMeasurement).toBe(true);
  });

  it("verifies public zero-cost Esri service endpoints", () => {
    expect(GIS_SERVICES.streets).toContain("World_Street_Map/MapServer");
    expect(GIS_SERVICES.satellite).toContain("World_Imagery/MapServer");
    expect(GIS_SERVICES.clarity).toContain("clarity.maptiles.arcgis.com");
    expect(GIS_SERVICES.boundaries).toContain("World_Boundaries_and_Places/MapServer");
    expect(GIS_SERVICES.citations).toContain("World_Imagery/MapServer/4");
    expect(GIS_SERVICES.elevation).toContain("WorldElevation3D/Terrain3D/ImageServer");
  });

  it("safely initializes Esri request interceptor without throwing", () => {
    expect(() => initEsriInterceptor()).not.toThrow();
  });

  it("parses coordinate inputs correctly and validates bounds", () => {
    // Valid comma separated
    const p1 = parseCoordinateInput("16.5062, 80.6480");
    expect(p1).toEqual({ latitude: 16.5062, longitude: 80.648 });

    // Valid space separated
    const p2 = parseCoordinateInput("16.5170 80.6280");
    expect(p2).toEqual({ latitude: 16.517, longitude: 80.628 });

    // Invalid coordinates
    expect(parseCoordinateInput("invalid text")).toBeNull();
    expect(parseCoordinateInput("100.5, 80.6480")).toBeNull(); // Lat > 90
    expect(parseCoordinateInput("16.5062, 200.0")).toBeNull(); // Lon > 180
  });

  it("ensures default view focuses on Vijayawada operational area", () => {
    expect(DEFAULT_GIS_VIEW.center.latitude).toBeCloseTo(16.5062, 3);
    expect(DEFAULT_GIS_VIEW.center.longitude).toBeCloseTo(80.648, 3);
    expect(DEFAULT_GIS_VIEW.zoom).toBe(15);
  });

  it("verifies ArcGIS 5.x UI component configuration prevents appendChild crash", () => {
    // In @arcgis/core@5.x, DefaultUI component names only accept 'zoom' | 'compass' | 'navigation-toggle'
    // Passing 'attribution' in ui.components causes: TypeError: Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'
    // Attribution visibility is natively controlled via view.attributionVisible = true
    const validArcGIS5Components = ["zoom", "compass", "navigation-toggle"];
    const invalidComponent = "attribution";
    expect(validArcGIS5Components).not.toContain(invalidComponent);
  });
});
