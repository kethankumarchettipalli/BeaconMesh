import React, { useEffect, useRef, useState, useCallback } from "react";
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import TileLayer from "@arcgis/core/layers/TileLayer.js";
import Swipe from "@arcgis/core/widgets/Swipe.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import {
  Columns,
  SplitSquareVertical,
  X,
  Layers,
  Image,
  Sparkles,
} from "lucide-react";
import {
  initEsriInterceptor,
  GIS_SERVICES,
  DEFAULT_GIS_VIEW,
  type BasemapMode,
  type MapViewState,
} from "@/lib/gis/gis-config";

export type ComparisonDisplayMode = "side-by-side" | "swipe";

export interface ComparisonViewProps {
  isOpen: boolean;
  onClose: () => void;
  initialCenter?: { latitude: number; longitude: number };
  initialZoom?: number;
  className?: string;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({
  isOpen,
  onClose,
  initialCenter = DEFAULT_GIS_VIEW.center,
  initialZoom = DEFAULT_GIS_VIEW.zoom,
  className = "",
}) => {
  const [displayMode, setDisplayMode] = useState<ComparisonDisplayMode>("side-by-side");
  const [leftBasemap, setLeftBasemap] = useState<BasemapMode>("satellite");
  const [rightBasemap, setRightBasemap] = useState<BasemapMode>("streets");

  // DOM Container Refs
  const leftDivRef = useRef<HTMLDivElement>(null);
  const rightDivRef = useRef<HTMLDivElement>(null);
  const swipeDivRef = useRef<HTMLDivElement>(null);

  // ArcGIS Object Refs
  const leftViewRef = useRef<MapView | null>(null);
  const rightViewRef = useRef<MapView | null>(null);
  const swipeViewRef = useRef<MapView | null>(null);
  const swipeWidgetRef = useRef<Swipe | null>(null);
  const handlesRef = useRef<Array<{ remove: () => void }>>([]);
  const isSyncingRef = useRef(false);

  // Cleanup helper
  const cleanupAll = useCallback(() => {
    handlesRef.current.forEach((h) => {
      try {
        h.remove();
      } catch {
        // Ignore
      }
    });
    handlesRef.current = [];

    if (swipeWidgetRef.current) {
      try {
        swipeWidgetRef.current.destroy();
      } catch {
        // Ignore
      }
      swipeWidgetRef.current = null;
    }

    [leftViewRef, rightViewRef, swipeViewRef].forEach((vRef) => {
      if (vRef.current) {
        try {
          vRef.current.destroy();
        } catch {
          // Ignore
        }
        vRef.current = null;
      }
    });
  }, []);

  const getTileUrlForMode = (mode: BasemapMode) => {
    switch (mode) {
      case "streets":
        return GIS_SERVICES.streets;
      case "clarity":
        return GIS_SERVICES.clarity;
      case "satellite":
      default:
        return GIS_SERVICES.satellite;
    }
  };

  // Setup Side-by-Side Dual Views
  useEffect(() => {
    if (!isOpen || displayMode !== "side-by-side") return;
    if (!leftDivRef.current || !rightDivRef.current) return;

    initEsriInterceptor();
    cleanupAll();

    let isMounted = true;

    // 1. Left View setup
    const leftLayer = new TileLayer({
      url: getTileUrlForMode(leftBasemap),
      id: "left-compare-layer",
    });
    const leftMap = new Map({ layers: [leftLayer] });
    const leftView = new MapView({
      container: leftDivRef.current,
      map: leftMap,
      center: [initialCenter.longitude, initialCenter.latitude],
      zoom: initialZoom,
      attributionVisible: true,
      ui: { components: [] },
    });
    leftViewRef.current = leftView;

    // 2. Right View setup
    const rightLayer = new TileLayer({
      url: getTileUrlForMode(rightBasemap),
      id: "right-compare-layer",
    });
    const rightMap = new Map({ layers: [rightLayer] });
    const rightView = new MapView({
      container: rightDivRef.current,
      map: rightMap,
      center: [initialCenter.longitude, initialCenter.latitude],
      zoom: initialZoom,
      attributionVisible: true,
      ui: { components: [] },
    });
    rightViewRef.current = rightView;

    // 3. Bi-directional Camera Synchronization
    Promise.all([leftView.when(), rightView.when()])
      .then(() => {
        if (!isMounted) return;

        // Left view moves -> update right view
        const leftHandle = reactiveUtils.watch(
          () => ({
            center: leftView.center,
            zoom: leftView.zoom,
            rotation: leftView.rotation,
          }),
          (state) => {
            if (isSyncingRef.current || !rightViewRef.current) return;
            isSyncingRef.current = true;
            rightViewRef.current
              .goTo(
                {
                  center: state.center,
                  zoom: state.zoom,
                  rotation: state.rotation,
                },
                { animate: false },
              )
              .finally(() => {
                isSyncingRef.current = false;
              });
          },
        );
        handlesRef.current.push(leftHandle);

        // Right view moves -> update left view
        const rightHandle = reactiveUtils.watch(
          () => ({
            center: rightView.center,
            zoom: rightView.zoom,
            rotation: rightView.rotation,
          }),
          (state) => {
            if (isSyncingRef.current || !leftViewRef.current) return;
            isSyncingRef.current = true;
            leftViewRef.current
              .goTo(
                {
                  center: state.center,
                  zoom: state.zoom,
                  rotation: state.rotation,
                },
                { animate: false },
              )
              .finally(() => {
                isSyncingRef.current = false;
              });
          },
        );
        handlesRef.current.push(rightHandle);
      })
      .catch((err) => {
        console.error("[ComparisonView] Dual view init error:", err);
      });

    return () => {
      isMounted = false;
      cleanupAll();
    };
  }, [isOpen, displayMode, leftBasemap, rightBasemap]);

  // Setup Swipe View
  useEffect(() => {
    if (!isOpen || displayMode !== "swipe") return;
    if (!swipeDivRef.current) return;

    initEsriInterceptor();
    cleanupAll();

    let isMounted = true;

    // Leading (Left) and Trailing (Right) TileLayers
    const leadingLayer = new TileLayer({
      url: getTileUrlForMode(leftBasemap),
      id: "swipe-leading-layer",
    });
    const trailingLayer = new TileLayer({
      url: getTileUrlForMode(rightBasemap),
      id: "swipe-trailing-layer",
    });

    const swipeMap = new Map({
      layers: [trailingLayer, leadingLayer],
    });

    const swipeView = new MapView({
      container: swipeDivRef.current,
      map: swipeMap,
      center: [initialCenter.longitude, initialCenter.latitude],
      zoom: initialZoom,
      attributionVisible: true,
      ui: { components: [] },
    });
    swipeViewRef.current = swipeView;

    swipeView
      .when(() => {
        if (!isMounted) return;

        const swipe = new Swipe({
          view: swipeView,
          leadingLayers: [leadingLayer],
          trailingLayers: [trailingLayer],
          direction: "horizontal",
          position: 50,
        });
        swipeWidgetRef.current = swipe;
        swipeView.ui.add(swipe);
      })
      .catch((err) => {
        console.error("[ComparisonView] Swipe init error:", err);
      });

    return () => {
      isMounted = false;
      cleanupAll();
    };
  }, [isOpen, displayMode, leftBasemap, rightBasemap]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-background select-none ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label="GIS Comparison View"
    >
      {/* Top Bar Controls */}
      <header className="flex h-12 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-md">
        {/* Left Basemap Select */}
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {displayMode === "swipe" ? "Leading (Left):" : "Left Window:"}
          </span>
          <div className="flex items-center rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setLeftBasemap("satellite")}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                leftBasemap === "satellite" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Image className="h-3 w-3" />
              <span>Satellite</span>
            </button>
            <button
              type="button"
              onClick={() => setLeftBasemap("streets")}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                leftBasemap === "streets" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>Streets</span>
            </button>
            <button
              type="button"
              onClick={() => setLeftBasemap("clarity")}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                leftBasemap === "clarity" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>Clarity</span>
            </button>
          </div>
        </div>

        {/* Center Mode Switcher */}
        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setDisplayMode("side-by-side")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
              displayMode === "side-by-side" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Columns className="h-3.5 w-3.5" />
            <span>Side-by-Side</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode("swipe")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
              displayMode === "swipe" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SplitSquareVertical className="h-3.5 w-3.5" />
            <span>Interactive Swipe</span>
          </button>
        </div>

        {/* Right Basemap Select & Close */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {displayMode === "swipe" ? "Trailing (Right):" : "Right Window:"}
            </span>
            <div className="flex items-center rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setRightBasemap("satellite")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                  rightBasemap === "satellite" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Image className="h-3 w-3" />
                <span>Satellite</span>
              </button>
              <button
                type="button"
                onClick={() => setRightBasemap("streets")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                  rightBasemap === "streets" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-3 w-3" />
                <span>Streets</span>
              </button>
              <button
                type="button"
                onClick={() => setRightBasemap("clarity")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                  rightBasemap === "clarity" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                <span>Clarity</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted transition-colors"
            title="Exit Comparison View"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full overflow-hidden">
        {displayMode === "side-by-side" ? (
          <div className="grid h-full w-full grid-cols-2 divide-x divide-border">
            <div ref={leftDivRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
            <div ref={rightDivRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
          </div>
        ) : (
          <div ref={swipeDivRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
        )}
      </div>
    </div>
  );
};
