import React, { useEffect, useRef, useState, useCallback } from "react";
import Map from "@arcgis/core/Map.js";
import SceneView from "@arcgis/core/views/SceneView.js";
import TileLayer from "@arcgis/core/layers/TileLayer.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import {
  initEsriInterceptor,
  GIS_SERVICES,
  DEFAULT_GIS_VIEW,
  type BasemapMode,
  type GeoPoint,
  type MapViewState,
} from "@/lib/gis/gis-config";
import { EarthProNav } from "./EarthProNav";

export interface SceneViewContainerProps {
  basemapMode?: BasemapMode;
  initialCenter?: GeoPoint;
  initialZoom?: number;
  initialHeading?: number;
  initialTilt?: number;
  onViewStateChange?: (state: MapViewState) => void;
  onMapClick?: (coords: GeoPoint, zoom: number, scale: number) => void;
  showEarthProNav?: boolean;
  className?: string;
  children?: React.ReactNode;
  onViewReady?: (view: SceneView) => void;
}

export const SceneViewContainer: React.FC<SceneViewContainerProps> = ({
  basemapMode = "satellite",
  initialCenter,
  initialZoom,
  initialHeading = 0,
  initialTilt = 55,
  onViewStateChange,
  onMapClick,
  showEarthProNav = true,
  className = "",
  children,
  onViewReady,
}) => {
  const sceneDivRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);
  const mapRef = useRef<Map | null>(null);
  const handlesRef = useRef<Array<{ remove: () => void }>>([]);

  const targetCenter = initialCenter || DEFAULT_GIS_VIEW.center;
  const targetZoom = initialZoom || DEFAULT_GIS_VIEW.zoom;
  // Estimate altitude from zoom LOD: zoom 15 ~ 2200m, higher zoom = lower altitude
  const altitudeMeters = Math.max(300, Math.min(25000, 2200 * Math.pow(2, 15 - targetZoom)));

  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !sceneDivRef.current) return;

    initEsriInterceptor();

    let isMounted = true;
    const div = sceneDivRef.current;

    // 1. Build Base TileLayer
    const baseLayer = new TileLayer({
      url:
        basemapMode === "streets"
          ? GIS_SERVICES.streets
          : basemapMode === "clarity"
            ? GIS_SERVICES.clarity
            : GIS_SERVICES.satellite,
      id: "beacon-scene-base",
      title: basemapMode === "streets" ? "World Street Map" : "World Imagery",
    });

    const boundariesLayer = new TileLayer({
      url: GIS_SERVICES.boundaries,
      id: "beacon-scene-boundaries",
      title: "World Boundaries & Places",
      opacity: 0.85,
      visible: basemapMode !== "streets",
    });

    // 2. Map with real World Elevation 3D Ground
    const map = new Map({
      ground: "world-elevation", // Authentic 3D terrain elevation
      layers: [baseLayer, boundariesLayer],
    });
    mapRef.current = map;

    // 3. SceneView instance with oblique 3D relief perspective
    const view = new SceneView({
      container: div,
      map: map,
      camera: {
        position: {
          latitude: targetCenter.latitude - 0.015, // Offset south for dramatic northward oblique look
          longitude: targetCenter.longitude,
          z: altitudeMeters,
        },
        heading: initialHeading,
        tilt: initialTilt,
      },
      qualityProfile: "high",
      environment: {
        atmosphere: {
          quality: "high",
        },
        lighting: {
          directShadowsEnabled: true,
          ambientOcclusionEnabled: true,
        },
      },
      attributionVisible: true,
      ui: {
        components: [], // In ArcGIS 5.x, components only accepts 'zoom'|'compass'|'navigation-toggle'
      },
    });
    viewRef.current = view;

    view
      .when(() => {
        if (!isMounted) return;
        setIsLoaded(true);
        if (onViewReady) onViewReady(view);

        // Watch camera and center changes reactively
        const watchHandle = reactiveUtils.watch(
          () => ({
            center: view.center,
            zoom: view.zoom,
            scale: view.scale,
            camera: view.camera,
            stationary: view.stationary,
          }),
          (state) => {
            if (!state.center) return;

            if (state.stationary && onViewStateChange) {
              onViewStateChange({
                center: {
                  latitude: state.center.latitude,
                  longitude: state.center.longitude,
                },
                zoom: state.zoom,
                scale: state.scale,
                rotation: state.camera?.heading || 0,
                tilt: state.camera?.tilt || 0,
              });
            }
          },
        );
        handlesRef.current.push(watchHandle);

        // Click handler
        const clickHandle = view.on("click", (event) => {
          if (!event.mapPoint) return;
          if (onMapClick) {
            onMapClick(
              {
                latitude: event.mapPoint.latitude,
                longitude: event.mapPoint.longitude,
              },
              view.zoom,
              view.scale,
            );
          }
        });
        handlesRef.current.push(clickHandle);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("[SceneViewContainer] Initialization failed:", err);
        setInitError(err?.message || "Failed to initialize 3D ArcGIS SceneView");
      });

    return () => {
      isMounted = false;
      handlesRef.current.forEach((h) => {
        try {
          h.remove();
        } catch {
          // Ignore
        }
      });
      handlesRef.current = [];

      if (viewRef.current) {
        try {
          viewRef.current.destroy();
        } catch {
          // Ignore
        }
        viewRef.current = null;
      }
      mapRef.current = null;
      setIsLoaded(false);
    };
  }, [basemapMode]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-slate-950 select-none ${className}`}>
      {/* 3D WebGL Canvas */}
      <div ref={sceneDivRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {!isLoaded && !initError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 shadow-lg">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-signal border-t-transparent" />
            <span className="text-xs font-medium text-foreground">
              Loading 3D Terrain SceneView...
            </span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {initError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 z-10">
          <div className="max-w-md rounded-lg border border-urgent/40 bg-urgent/10 p-4 text-center">
            <p className="text-sm font-semibold text-urgent">3D Scene Engine Error</p>
            <p className="mt-1 text-xs text-foreground">{initError}</p>
          </div>
        </div>
      )}

      {/* EarthProNav Navigation System */}
      {showEarthProNav && isLoaded && (
        <EarthProNav view={viewRef.current} is3D={true} className="z-20" />
      )}

      {/* Injected Children (HUD, Panels) */}
      {children}
    </div>
  );
};
