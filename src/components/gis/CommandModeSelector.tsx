import React from "react";
import { Layers, Globe, Map as MapIcon, Image, Sparkles } from "lucide-react";
import type { BasemapMode, ViewDimension } from "@/lib/gis/gis-config";

export interface CommandModeSelectorProps {
  basemapMode: BasemapMode;
  dimension: ViewDimension;
  onBasemapChange: (mode: BasemapMode) => void;
  onDimensionChange: (dim: ViewDimension) => void;
  allowedBasemaps?: BasemapMode[];
  allowedDimensions?: ViewDimension[];
  className?: string;
}

export const CommandModeSelector: React.FC<CommandModeSelectorProps> = ({
  basemapMode,
  dimension,
  onBasemapChange,
  onDimensionChange,
  allowedBasemaps = ["streets", "satellite", "clarity"],
  allowedDimensions = ["2d", "3d"],
  className = "",
}) => {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-background/95 p-1.5 shadow-md backdrop-blur-md ${className}`}
    >
      {/* Dimension Selector (2D vs 3D) */}
      {allowedDimensions.length > 1 && (
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => onDimensionChange("2d")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
              dimension === "2d"
                ? "bg-signal text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Switch to 2D Planar Orthographic View"
            aria-pressed={dimension === "2d"}
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span>2D View</span>
          </button>

          <button
            type="button"
            onClick={() => onDimensionChange("3d")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
              dimension === "3d"
                ? "bg-signal text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Switch to 3D Oblique Terrain Relief"
            aria-pressed={dimension === "3d"}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>3D Terrain</span>
          </button>
        </div>
      )}

      {/* Basemap Mode Selector (Streets vs Satellite vs Clarity) */}
      <div className="flex items-center rounded-md border border-border bg-card p-0.5">
        {allowedBasemaps.includes("streets") && (
          <button
            type="button"
            onClick={() => onBasemapChange("streets")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
              basemapMode === "streets"
                ? "bg-signal text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="World Street Map (Cartographic infrastructure, road names & boundaries)"
            aria-pressed={basemapMode === "streets"}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Streets</span>
          </button>
        )}

        {allowedBasemaps.includes("satellite") && (
          <button
            type="button"
            onClick={() => onBasemapChange("satellite")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
              basemapMode === "satellite"
                ? "bg-signal text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="World Imagery (High-resolution optical satellite & aerial imagery)"
            aria-pressed={basemapMode === "satellite"}
          >
            <Image className="h-3.5 w-3.5" />
            <span>Satellite</span>
          </button>
        )}

        {allowedBasemaps.includes("clarity") && (
          <button
            type="button"
            onClick={() => onBasemapChange("clarity")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
              basemapMode === "clarity"
                ? "bg-signal text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="World Imagery Clarity (Archive with minimal cloud obstruction)"
            aria-pressed={basemapMode === "clarity"}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Clarity</span>
          </button>
        )}
      </div>
    </div>
  );
};
