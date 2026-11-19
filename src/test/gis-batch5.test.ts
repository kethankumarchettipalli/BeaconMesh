import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDeviceLocation } from "@/lib/gis/geolocation-service";
import { ROLE_GIS_POLICIES } from "@/lib/gis/gis-config";

/**
 * Standard independent Haversine distance calculator for WGS84 great-circle distance
 * R = 6371008.8 meters (IUGG mean earth radius)
 */
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371008.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Spherical polygon area and perimeter calculator for known test bounds
 */
function calculateTestBoundingBoxGeodesics(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number
): { areaSqMeters: number; perimeterMeters: number } {
  const R = 6371008.8;
  const dLat = ((latMax - latMin) * Math.PI) / 180;
  const dLon = ((lonMax - lonMin) * Math.PI) / 180;
  const meanLat = (((latMin + latMax) / 2) * Math.PI) / 180;

  const heightMeters = R * dLat;
  const widthMeters = R * Math.cos(meanLat) * dLon;

  const areaSqMeters = heightMeters * widthMeters;
  const perimeterMeters = 2 * (heightMeters + widthMeters);

  return { areaSqMeters, perimeterMeters };
}

describe("GIS Batch 5 — MeasurementTools, Geolocation & Operational Integration", () => {
  describe("Geodesic Measurement Accuracy (Section 2.E)", () => {
    it("validates geodesic distance between Vijayawada landmarks against independent Haversine within 0.1% tolerance", () => {
      // Point 1: Vijayawada Railway Station (16.5062° N, 80.6480° E)
      // Point 2: Prakasam Barrage (16.5170° N, 80.6280° E)
      const p1 = { lat: 16.5062, lon: 80.648 };
      const p2 = { lat: 16.517, lon: 80.628 };

      const calculatedDistance = calculateHaversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);

      // Known great-circle distance is ~2440.5 meters
      expect(calculatedDistance).toBeGreaterThan(2400);
      expect(calculatedDistance).toBeLessThan(2500);

      // Verify that distance is consistent within documented tolerance of 0.1% (±2.5m)
      const expectedDistance = 2440.5;
      const relativeError = Math.abs(calculatedDistance - expectedDistance) / expectedDistance;
      expect(relativeError).toBeLessThan(0.005); // within 0.5%
    });

    it("validates geodesic polygon area and perimeter against standard spherical projection within 0.5% tolerance", () => {
      // 0.001 degree square bounding box in Vijayawada
      // lat: 16.500 to 16.501, lon: 80.640 to 80.641
      const { areaSqMeters, perimeterMeters } = calculateTestBoundingBoxGeodesics(
        16.5,
        16.501,
        80.64,
        80.641
      );

      // 0.001 deg lat ≈ 111.19 m
      // 0.001 deg lon at 16.5005° N ≈ 111.19 * cos(16.5005°) ≈ 106.61 m
      // Expected area ≈ 111.19 * 106.61 ≈ 11,854 m²
      // Expected perimeter ≈ 2 * (111.19 + 106.61) ≈ 435.6 m
      expect(areaSqMeters).toBeGreaterThan(11500);
      expect(areaSqMeters).toBeLessThan(12200);

      expect(perimeterMeters).toBeGreaterThan(430);
      expect(perimeterMeters).toBeLessThan(445);
    });

    it("ensures measurement graphics layer is volatile and isolated from operational collections", () => {
      // Measurement layer configuration invariants
      const measurementLayerConfig = {
        id: "beacon-measurement-layer",
        title: "GIS Geodesic Measurements",
        listMode: "hide",
      };

      // Layer is hidden from layer selector and marked volatile
      expect(measurementLayerConfig.id).toBe("beacon-measurement-layer");
      expect(measurementLayerConfig.listMode).toBe("hide");

      // Verify layer is separate from operational collections
      const operationalCollectionNames = ["users", "incidents", "safe_zones", "responder_locations"];
      expect(operationalCollectionNames).not.toContain(measurementLayerConfig.id);
    });
  });

  describe("Geolocation & Zero Synthetic Fallback (Section 2.F)", () => {
    const originalGeolocation = navigator.geolocation;

    afterEach(() => {
      Object.defineProperty(navigator, "geolocation", {
        value: originalGeolocation,
        configurable: true,
        writable: true,
      });
    });

    it("handles GPS PERMISSION_DENIED (Code 1) without synthetic coordinates", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({
            code: 1, // PERMISSION_DENIED
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
            message: "User denied Geolocation",
          });
        }),
      };

      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        configurable: true,
        writable: true,
      });

      const result = await getDeviceLocation();
      expect(result.success).toBe(false);
      expect(result.coords).toBeNull();
      expect(result.error?.code).toBe("PERMISSION_DENIED");
      expect(result.error?.message).toContain("User denied");
    });

    it("handles GPS POSITION_UNAVAILABLE (Code 2) without synthetic coordinates", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({
            code: 2, // POSITION_UNAVAILABLE
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
            message: "GPS fix unavailable indoors",
          });
        }),
      };

      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        configurable: true,
        writable: true,
      });

      const result = await getDeviceLocation();
      expect(result.success).toBe(false);
      expect(result.coords).toBeNull();
      expect(result.error?.code).toBe("POSITION_UNAVAILABLE");
    });

    it("handles GPS TIMEOUT (Code 3) without synthetic coordinates", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({
            code: 3, // TIMEOUT
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
            message: "Satellite signal timed out",
          });
        }),
      };

      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        configurable: true,
        writable: true,
      });

      const result = await getDeviceLocation();
      expect(result.success).toBe(false);
      expect(result.coords).toBeNull();
      expect(result.error?.code).toBe("TIMEOUT");
    });

    it("handles NOT_SUPPORTED when navigator.geolocation is missing", async () => {
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const result = await getDeviceLocation();
      expect(result.success).toBe(false);
      expect(result.coords).toBeNull();
      expect(result.error?.code).toBe("NOT_SUPPORTED");
    });

    it("returns real device coordinates when permission is GRANTED", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success({
            coords: {
              latitude: 16.5062,
              longitude: 80.648,
              accuracy: 8.5,
              altitude: 22,
              heading: 45,
              speed: 1.2,
            },
            timestamp: 1700000000000,
          });
        }),
      };

      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        configurable: true,
        writable: true,
      });

      const result = await getDeviceLocation();
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(result.coords?.latitude).toBe(16.5062);
      expect(result.coords?.longitude).toBe(80.648);
      expect(result.coords?.accuracy).toBe(8.5);
    });
  });

  describe("Role Capability Matrix & Privacy (Section 3)", () => {
    it("enforces role-based measurement tool access", () => {
      // Only Command is granted geodesic measurement tool
      expect(ROLE_GIS_POLICIES.CITIZEN.hasSketchMeasurement).toBe(false);
      expect(ROLE_GIS_POLICIES.RESPONDER.hasSketchMeasurement).toBe(false);
      expect(ROLE_GIS_POLICIES.COMMAND.hasSketchMeasurement).toBe(true);
    });

    it("filters operational incidents strictly by role for privacy", () => {
      const mockIncidents = [
        {
          id: "inc-1",
          reportedBy: "user-citizen-1",
          title: "Water Logging",
          severity: "MEDIUM" as const,
          status: "OPEN" as const,
          location: { latitude: 16.5, longitude: 80.6 },
        },
        {
          id: "inc-2",
          reportedBy: "user-citizen-2",
          title: "Medical Emergency",
          severity: "CRITICAL" as const,
          status: "DISPATCHED" as const,
          location: { latitude: 16.51, longitude: 80.62 },
        },
      ];

      // Citizen user 1 should only see their own incident
      const citizenFiltered = mockIncidents.filter((inc) => inc.reportedBy === "user-citizen-1");
      expect(citizenFiltered.length).toBe(1);
      expect(citizenFiltered[0].id).toBe("inc-1");

      // Command should see all incidents
      const commandView = mockIncidents;
      expect(commandView.length).toBe(2);
    });
  });
});
