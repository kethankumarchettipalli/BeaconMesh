import React, { useState } from "react";
import {
  Plus,
  Minus,
  Home,
  Compass,
  Crosshair,
  Search,
  MapPin,
  ChevronDown,
  Navigation2,
  AlertCircle,
  Eye,
  ShieldCheck,
  Lock,
  Unlock,
} from "lucide-react";
import type { GeoPoint } from "@/lib/gis/gis-config";

export interface PresetLocation {
  id: string;
  name: string;
  category: string;
  description: string;
  coordinates: GeoPoint;
  zoom: number;
  expectedResolution: string;
  nativeLimitLOD: number;
}

export const PRESET_LOCATIONS: PresetLocation[] = [
  {
    id: "vijayawada-center",
    name: "Vijayawada City Center",
    category: "Urban Core",
    description: "Municipal core, M.G. Road commercial spine, multi-story masonry and transit terminals.",
    coordinates: { latitude: 16.5062, longitude: 80.6480 },
    zoom: 16,
    expectedResolution: "0.34 m (34 cm/px) — World Imagery Vivid",
    nativeLimitLOD: 19,
  },
  {
    id: "vijayawada-dense-urban",
    name: "Governorpet / Besant Road",
    category: "Dense Urban Residential",
    description: "Ultra-dense residential & commercial precinct, narrow corridors, masonry & tin-roof clusters.",
    coordinates: { latitude: 16.5170, longitude: 80.6280 },
    zoom: 18,
    expectedResolution: "0.34 m (34 cm/px) — High-density urban coverage",
    nativeLimitLOD: 19,
  },
  {
    id: "vijayawada-main-intersection",
    name: "Benz Circle Intersection",
    category: "Main Road Intersection",
    description: "Primary arterial junction (NH16 bypass & M.G. Road flyovers, heavy traffic lanes).",
    coordinates: { latitude: 16.4998, longitude: 80.6552 },
    zoom: 18,
    expectedResolution: "0.34 m (34 cm/px) — High-contrast asphalt infrastructure",
    nativeLimitLOD: 19,
  },
  {
    id: "vijayawada-open-land",
    name: "Krishna Floodplain / Undavalli",
    category: "Open Land",
    description: "Wide alluvial sandbanks, unpaved terrain, agricultural plots and sparse riverbed vegetation.",
    coordinates: { latitude: 16.5150, longitude: 80.5750 },
    zoom: 16,
    expectedResolution: "0.34 m (34 cm/px) — Sensor acquisition block",
    nativeLimitLOD: 19,
  },
  {
    id: "vijayawada-vegetated",
    name: "Bhavani Island & Riverine Canopy",
    category: "Vegetated Area",
    description: "Dense deciduous river island canopy, mangrove fringes, water-to-vegetation boundaries.",
    coordinates: { latitude: 16.5250, longitude: 80.5900 },
    zoom: 17,
    expectedResolution: "0.34 m (34 cm/px) — Dense chlorophyll absorption",
    nativeLimitLOD: 19,
  },
];

export interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetExtent: () => void;
  onResetNorth?: () => void;
  onInspectCenter?: () => void;
  onNavigateTo?: (coords: GeoPoint, zoom?: number) => void;
  onSnapToNativeLimit?: () => void;
  isInspectionMode?: boolean;
  onToggleInspectionMode?: () => void;
  isOverzoomAllowed?: boolean;
  onToggleOverzoom?: () => void;
  currentZoom?: number;
  showPresetsAndSearch?: boolean;
}

export function parseCoordinateInput(input: string): GeoPoint | null {
  const cleaned = input.trim();
  const parts = cleaned.split(/[\s,]+/);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetExtent,
  onResetNorth,
  onInspectCenter,
  onNavigateTo,
  onSnapToNativeLimit,
  isInspectionMode = false,
  onToggleInspectionMode,
  isOverzoomAllowed = false,
  onToggleOverzoom,
  currentZoom,
  showPresetsAndSearch = true,
}) => {
  const [searchInput, setSearchInput] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string>("vijayawada-center");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);

    const parsed = parseCoordinateInput(searchInput);
    if (parsed && onNavigateTo) {
      onNavigateTo(parsed, 17);
      setSearchInput("");
      setActivePresetId("");
    } else {
      setSearchError('Invalid coordinates. Use format "16.5062, 80.6480"');
    }
  };

  const handleSelectPreset = (preset: PresetLocation) => {
    setActivePresetId(preset.id);
    if (onNavigateTo) {
      onNavigateTo(preset.coordinates, preset.zoom);
    }
    setIsPresetMenuOpen(false);
    setSearchError(null);
  };

  return (
    <>
      {/* Search & Preset Bar */}
      {showPresetsAndSearch && onNavigateTo && (
        <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-background/95 p-1.5 shadow-md backdrop-blur-md">
          {/* Preset Location Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              title="Select GIS Location Preset"
            >
              <MapPin className="h-3.5 w-3.5 text-signal" />
              <span className="max-w-[130px] truncate">
                {PRESET_LOCATIONS.find((p) => p.id === activePresetId)?.name || "Select Preset"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {isPresetMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 rounded-lg border border-border bg-card p-1.5 shadow-xl z-50">
                <div className="border-b border-border px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Test Location Presets
                </div>
                <div className="max-h-60 overflow-y-auto py-1 space-y-1">
                  {PRESET_LOCATIONS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${
                        activePresetId === preset.id
                          ? "bg-signal/15 text-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{preset.name}</span>
                        <span className="text-[0.65rem] text-muted-foreground">{preset.category}</span>
                      </div>
                      <div className="text-[0.7rem] text-muted-foreground line-clamp-1">{preset.description}</div>
                      <div className="font-mono text-[0.65rem] text-signal/90">
                        {preset.coordinates.latitude.toFixed(4)}°N, {preset.coordinates.longitude.toFixed(4)}°E
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Coordinate Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1">
            <div className="relative flex items-center">
              <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Lat, Long (e.g. 16.5062, 80.6480)"
                className="h-7 w-48 rounded-md border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
            <button
              type="submit"
              className="flex h-7 items-center gap-1 rounded-md bg-signal px-2 text-xs font-medium text-white hover:bg-signal/90"
              title="Navigate to coordinates"
            >
              <Navigation2 className="h-3 w-3" />
              <span>Go</span>
            </button>
          </form>

          {searchError && (
            <div className="flex items-center gap-1 text-[0.7rem] text-urgent font-medium px-2 py-0.5 rounded bg-urgent/10">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}
        </div>
      )}

      {/* Vertical Navigation Controls Strip */}
      <div className="absolute right-4 top-4 z-20 flex flex-col gap-1 rounded-lg border border-border/80 bg-background/95 p-1 shadow-md backdrop-blur-md">
        <button
          type="button"
          onClick={onZoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          title="Zoom In (+)"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>

        {currentZoom != null && (
          <div className="text-center font-mono text-[0.65rem] font-bold text-muted-foreground select-none">
            {Math.round(currentZoom)}
          </div>
        )}

        <button
          type="button"
          onClick={onZoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          title="Zoom Out (-)"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>

        <div className="h-px bg-border my-0.5" />

        <button
          type="button"
          onClick={onResetExtent}
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          title="Reset to Home Extent"
          aria-label="Reset extent"
        >
          <Home className="h-4 w-4" />
        </button>

        {onResetNorth && (
          <button
            type="button"
            onClick={onResetNorth}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            title="Reset North Heading"
            aria-label="Reset north"
          >
            <Compass className="h-4 w-4" />
          </button>
        )}

        {onInspectCenter && (
          <button
            type="button"
            onClick={onInspectCenter}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            title="Inspect Underlying Imagery at Center"
            aria-label="Inspect center"
          >
            <Crosshair className="h-4 w-4" />
          </button>
        )}

        {onSnapToNativeLimit && (
          <button
            type="button"
            onClick={onSnapToNativeLimit}
            className="flex h-8 w-8 items-center justify-center rounded-md text-safe transition-colors hover:bg-muted"
            title="Snap to Native Optical Limit (LOD 19 / 0.34m/px)"
            aria-label="Snap to native limit"
          >
            <ShieldCheck className="h-4 w-4" />
          </button>
        )}

        {onToggleOverzoom && (
          <button
            type="button"
            onClick={onToggleOverzoom}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              isOverzoomAllowed ? "text-amber-500 bg-amber-500/10" : "text-muted-foreground hover:bg-muted"
            }`}
            title={
              isOverzoomAllowed
                ? "Digital Overzoom Active (LOD 20-23 allowed). Click to lock to optical limit (LOD 19)."
                : "Native Optical Limit Locked (LOD 19). Click to allow digital overzoom (LOD 20-23)."
            }
            aria-label="Toggle overzoom"
          >
            {isOverzoomAllowed ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </button>
        )}

        {onToggleInspectionMode && (
          <button
            type="button"
            onClick={onToggleInspectionMode}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              isInspectionMode ? "bg-signal text-white" : "text-foreground hover:bg-muted"
            }`}
            title={isInspectionMode ? "Exit Inspection Click Mode" : "Enter Click-to-Inspect Mode"}
            aria-label="Toggle inspection mode"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
      </div>
    </>
  );
};
