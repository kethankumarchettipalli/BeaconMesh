import React, { useState } from "react";
import { Copy, Check, MapPin, ZoomIn, Gauge, Globe2 } from "lucide-react";
import type { MapViewState, ViewDimension } from "@/lib/gis/gis-config";
import {
  calculateGroundResolutionMpp,
  formatResolution,
  formatScaleRatio,
} from "@/lib/gis/resolution-utils";

export interface CoordinateHUDProps {
  viewState?: MapViewState | null;
  dimension?: ViewDimension;
  className?: string;
}

export const CoordinateHUD: React.FC<CoordinateHUDProps> = ({
  viewState,
  dimension = "2d",
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  if (!viewState || !viewState.center) {
    return null;
  }

  const { latitude, longitude } = viewState.center;
  const zoom = viewState.zoom || 0;
  const scale = viewState.scale || 0;

  // Calculate live latitude-adjusted GSD
  const gsdMpp = calculateGroundResolutionMpp(latitude, zoom);
  const formattedGsd = formatResolution(gsdMpp);
  const formattedScale = formatScaleRatio(scale);

  const latStr = `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? "E" : "W"}`;

  const handleCopyCoords = async () => {
    try {
      await navigator.clipboard.writeText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignore
    }
  };

  return (
    <div
      className={`absolute bottom-6 left-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-border/80 bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-md select-none ${className}`}
      role="region"
      aria-label="Coordinate & Map Scale HUD"
    >
      {/* Coordinates & Copy */}
      <div className="flex items-center gap-1.5 font-mono text-[0.72rem] text-foreground">
        <MapPin className="h-3.5 w-3.5 text-signal shrink-0" />
        <span className="font-semibold">{latStr}</span>
        <span className="text-muted-foreground">,</span>
        <span className="font-semibold">{lonStr}</span>
        <button
          type="button"
          onClick={handleCopyCoords}
          className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Copy Coordinates to Clipboard"
          aria-label="Copy coordinates"
        >
          {copied ? (
            <Check className="h-3 w-3 text-safe" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>

      <div className="h-3.5 w-px bg-border shrink-0" />

      {/* Zoom LOD */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <ZoomIn className="h-3.5 w-3.5 text-signal shrink-0" />
        <span className="font-mono text-[0.72rem] font-medium text-foreground">
          LOD {zoom.toFixed(1)}
        </span>
      </div>

      <div className="h-3.5 w-px bg-border shrink-0" />

      {/* Scale Ratio */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <span className="font-mono text-[0.72rem] text-muted-foreground font-medium">
          Scale:
        </span>
        <span className="font-mono text-[0.72rem] font-semibold text-foreground">
          {formattedScale}
        </span>
      </div>

      <div className="h-3.5 w-px bg-border shrink-0" />

      {/* Display GSD (Ground Sample Distance) */}
      <div className="flex items-center gap-1 text-muted-foreground" title="Ground Sample Distance (Meters or cm per screen pixel)">
        <Gauge className="h-3.5 w-3.5 text-signal shrink-0" />
        <span className="font-mono text-[0.72rem] text-muted-foreground">GSD:</span>
        <span className="font-mono text-[0.72rem] font-semibold text-foreground">
          {formattedGsd.summary}
        </span>
      </div>

      <div className="h-3.5 w-px bg-border shrink-0" />

      {/* Dimension Badge */}
      <div className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
        <Globe2 className="h-3 w-3 text-signal shrink-0" />
        <span>{dimension === "3d" ? "3D Oblique" : "2D Planar"}</span>
      </div>
    </div>
  );
};
