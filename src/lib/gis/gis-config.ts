import esriConfig from "@arcgis/core/config.js";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface MapViewState {
  center: GeoPoint;
  zoom: number;
  scale: number;
  rotation: number;
  tilt?: number;
  extent?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

export type BasemapMode = "streets" | "satellite" | "clarity";
export type ViewDimension = "2d" | "3d";

export interface GisRoleCapabilities {
  allowedBasemaps: BasemapMode[];
  allowedDimensions: ViewDimension[];
  hasComparisonSwipe: boolean;
  hasInspector: boolean;
  hasSketchMeasurement: boolean;
  hasEarthProNav: boolean;
  hasOperationalLayers: boolean;
  hasAnalyticalLayers: boolean;
  hasSimulationLayers: boolean;
}

export const ROLE_GIS_POLICIES: Record<string, GisRoleCapabilities> = {
  CITIZEN: {
    allowedBasemaps: ["streets", "satellite"],
    allowedDimensions: ["2d"],
    hasComparisonSwipe: false,
    hasInspector: false,
    hasSketchMeasurement: false,
    hasEarthProNav: false,
    hasOperationalLayers: true, // safe zones, verified public alerts
    hasAnalyticalLayers: false,
    hasSimulationLayers: false,
  },
  RESPONDER: {
    allowedBasemaps: ["streets", "satellite"],
    allowedDimensions: ["2d"],
    hasComparisonSwipe: false,
    hasInspector: true, // resolution & coordinate HUD for field safety
    hasSketchMeasurement: false,
    hasEarthProNav: false,
    hasOperationalLayers: true, // on-duty responders, assigned incident
    hasAnalyticalLayers: false,
    hasSimulationLayers: false,
  },
  COMMAND: {
    allowedBasemaps: ["streets", "satellite", "clarity"],
    allowedDimensions: ["2d", "3d"], // Full 4-way independent combination
    hasComparisonSwipe: true,
    hasInspector: true,
    hasSketchMeasurement: true,
    hasEarthProNav: true,
    hasOperationalLayers: true,
    hasAnalyticalLayers: true,
    hasSimulationLayers: true,
  },
};

export const GIS_SERVICES = {
  streets: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer",
  satellite: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
  clarity: "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer",
  boundaries: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer",
  citations: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/4",
  elevation: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
};

export const DEFAULT_GIS_VIEW = {
  center: {
    latitude: 16.5062,
    longitude: 80.6480,
  },
  zoom: 15,
  minZoom: 2,
  maxZoom: 20,
};

let interceptorInitialized = false;

/**
 * Configure ArcGIS request interceptor to strip API token on free public tile services.
 * This guarantees zero 401/498 errors when an API key is set in application environment.
 */
export function initEsriInterceptor(): void {
  if (typeof window === "undefined" || interceptorInitialized) return;

  if (!esriConfig.request.interceptors) {
    esriConfig.request.interceptors = [];
  }

  esriConfig.request.interceptors.push({
    urls: [
      "https://services.arcgisonline.com",
      "https://clarity.maptiles.arcgis.com",
      "https://elevation3d.arcgis.com",
    ],
    before: (params: any) => {
      if (params.requestOptions?.query?.token) {
        delete params.requestOptions.query.token;
      }
      if (params.requestOptions) {
        params.requestOptions.authMode = "anonymous";
      }
    },
  });

  interceptorInitialized = true;
}
