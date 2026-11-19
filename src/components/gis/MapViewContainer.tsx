import React, { useEffect, useRef, useState, useCallback } from "react";
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
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
import { MapControls } from "./MapControls";

export interface MapViewContainerProps {
  basemapMode?: BasemapMode;
  initialCenter?: GeoPoint;
  initialZoom?: number;
  initialRotation?: number;
  onViewStateChange?: (state: MapViewState) => void;
  onMapClick?: (coords: GeoPoint, zoom: number, scale: number) => void;
  onInspectCenter?: () => void;
  isInspectionMode?: boolean;
  onToggleInspectionMode?: () => void;
  isOverzoomAllowed?: boolean;
  onToggleOverzoom?: () => void;
  showControls?: boolean;
  showPresetsAndSearch?: boolean;
  className?: string;
  children?: React.ReactNode;
  onViewReady?: (view: MapView) => void;
}

export const MapViewContainer: React.FC<MapViewContainerProps> = ({
  basemapMode = "satellite",
  initialCenter,
  initialZoom,
  initialRotation = 0,
  onViewStateChange,
  onMapClick,
  onInspectCenter,
  isInspectionMode = false,
  onToggleInspectionMode,
  isOverzoomAllowed = false,
  onToggleOverzoom,
  showControls = true,
  showPresetsAndSearch = true,
  className = "",
  children,
  onViewReady,
}) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const mapRef = useRef<Map | null>(null);
  const handlesRef = useRef<Array<{ remove: () => void }>>([]);

  const targetCenter = initialCenter || DEFAULT_GIS_VIEW.center;
  const targetZoom = initialZoom || DEFAULT_GIS_VIEW.zoom;

  const [currentZoom, setCurrentZoom] = useState<number>(targetZoom);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize ArcGIS Map & View
  useEffect(() => {
    if (typeof window === "undefined" || !mapDivRef.current) return;

    initEsriInterceptor();

    let isMounted = true;
    const div = mapDivRef.current;

    // 1. Build Layer Stack based on selected basemap mode
    const baseLayer = new TileLayer({
      url:
        basemapMode === "streets"
          ? GIS_SERVICES.streets
          : basemapMode === "clarity"
            ? GIS_SERVICES.clarity
            : GIS_SERVICES.satellite,
      id: "beacon-base-tiles",
      title: basemapMode === "streets" ? "World Street Map" : "World Imagery",
    });

    const boundariesLayer = new TileLayer({
      url: GIS_SERVICES.boundaries,
      id: "beacon-boundaries",
      title: "World Boundaries & Places",
      opacity: 0.85,
      visible: basemapMode !== "streets", // Streets already include labels
    });

    const map = new Map({
      layers: [baseLayer, boundariesLayer],
    });
    mapRef.current = map;

    const maxZoom = isOverzoomAllowed ? 23 : DEFAULT_GIS_VIEW.maxZoom;

    const view = new MapView({
      container: div,
      map: map,
      center: [targetCenter.longitude, targetCenter.latitude],
      zoom: targetZoom,
      rotation: initialRotation,
      constraints: {
        minZoom: DEFAULT_GIS_VIEW.minZoom,
        maxZoom: maxZoom,
        rotationEnabled: true,
      },
      attributionVisible: true,
      ui: {
        components: [], // In ArcGIS 5.x, components only accepts 'zoom'|'compass'|'navigation-toggle'; attribution is controlled via view.attributionVisible
      },
    });
    viewRef.current = view;

    // Wait for view to be ready
    view
      .when(() => {
        if (!isMounted) return;
        setIsLoaded(true);
        if (onViewReady) onViewReady(view);

        // Watch view state changes reactively
        const watchHandle = reactiveUtils.watch(
          () => ({
            center: view.center,
            zoom: view.zoom,
            scale: view.scale,
            rotation: view.rotation,
            extent: view.extent,
            stationary: view.stationary,
          }),
          (state) => {
            if (!state.center) return;
            setCurrentZoom(state.zoom);

            if (state.stationary && onViewStateChange) {
              onViewStateChange({
                center: {
                  latitude: state.center.latitude,
                  longitude: state.center.longitude,
                },
                zoom: state.zoom,
                scale: state.scale,
                rotation: state.rotation,
                extent: state.extent
                  ? {
                      xmin: state.extent.xmin,
                      ymin: state.extent.ymin,
                      xmax: state.extent.xmax,
                      ymax: state.extent.ymax,
                    }
                  : undefined,
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
        console.error("[MapViewContainer] Initialization failed:", err);
        setInitError(err?.message || "Failed to initialize 2D ArcGIS MapView");
      });

    return () => {
      isMounted = false;
      // Clean up watchers and listeners
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
  }, [basemapMode, isOverzoomAllowed]);

  // Update overzoom constraints when isOverzoomAllowed changes
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.constraints.maxZoom = isOverzoomAllowed ? 23 : DEFAULT_GIS_VIEW.maxZoom;
    }
  }, [isOverzoomAllowed]);

  // Navigation callbacks
  const handleZoomIn = useCallback(() => {
    if (viewRef.current) {
      void viewRef.current.goTo({ zoom: viewRef.current.zoom + 1 }, { duration: 250 });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (viewRef.current) {
      void viewRef.current.goTo({ zoom: viewRef.current.zoom - 1 }, { duration: 250 });
    }
  }, []);

  const handleResetExtent = useCallback(() => {
    if (viewRef.current) {
      void viewRef.current.goTo(
        {
          center: [DEFAULT_GIS_VIEW.center.longitude, DEFAULT_GIS_VIEW.center.latitude],
          zoom: DEFAULT_GIS_VIEW.zoom,
          rotation: 0,
        },
        { duration: 500 },
      );
    }
  }, []);

  const handleResetNorth = useCallback(() => {
    if (viewRef.current) {
      void viewRef.current.goTo({ rotation: 0 }, { duration: 300 });
    }
  }, []);

  const handleNavigateTo = useCallback((coords: GeoPoint, zoom: number = 17) => {
    if (viewRef.current) {
      void viewRef.current.goTo(
        {
          center: [coords.longitude, coords.latitude],
          zoom: zoom,
        },
        { duration: 500 },
      );
    }
  }, []);

  const handleSnapToNativeLimit = useCallback(() => {
    if (viewRef.current) {
      void viewRef.current.goTo({ zoom: 19 }, { duration: 300 });
    }
  }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-muted/20 select-none ${className}`}>
      {/* 2D Canvas */}
      <div
        ref={mapDivRef}
        className={`h-full w-full ${isInspectionMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      />

      {/* Loading Overlay */}
      {!isLoaded && !initError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 shadow-lg">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-signal border-t-transparent" />
            <span className="text-xs font-medium text-foreground">Loading 2D MapView...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {initError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 z-10">
          <div className="max-w-md rounded-lg border border-urgent/40 bg-urgent/10 p-4 text-center">
            <p className="text-sm font-semibold text-urgent">Map Engine Error</p>
            <p className="mt-1 text-xs text-foreground">{initError}</p>
          </div>
        </div>
      )}

      {/* Map Controls */}
      {showControls && isLoaded && (
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetExtent={handleResetExtent}
          onResetNorth={handleResetNorth}
          onInspectCenter={onInspectCenter}
          onNavigateTo={handleNavigateTo}
          onSnapToNativeLimit={handleSnapToNativeLimit}
          isInspectionMode={isInspectionMode}
          onToggleInspectionMode={onToggleInspectionMode}
          isOverzoomAllowed={isOverzoomAllowed}
          onToggleOverzoom={onToggleOverzoom}
          currentZoom={currentZoom}
          showPresetsAndSearch={showPresetsAndSearch}
        />
      )}

      {/* Injected Children (HUD, Inspector, Panels) */}
      {children}
    </div>
  );
};
