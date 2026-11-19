import React from "react";
import {
  Layers,
  X,
  AlertTriangle,
  Shield,
  Radio,
  MapPin,
  Waves,
  Eye,
  EyeOff,
  Sliders,
  Footprints,
} from "lucide-react";

export interface LayerConfig {
  id: string;
  title: string;
  category: "operational" | "analytical" | "simulation";
  visible: boolean;
  opacity: number;
  description: string;
}

export interface LayerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerConfig[];
  onToggleLayer: (layerId: string) => void;
  onChangeOpacity: (layerId: string, opacity: number) => void;
  className?: string;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  isOpen,
  onClose,
  layers,
  onToggleLayer,
  onChangeOpacity,
  className = "",
}) => {
  if (!isOpen) return null;

  const operationalLayers = layers.filter((l) => l.category === "operational");
  const analyticalLayers = layers.filter((l) => l.category === "analytical");
  const simulationLayers = layers.filter((l) => l.category === "simulation");

  const renderLayerRow = (layer: LayerConfig) => (
    <div
      key={layer.id}
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 text-xs transition-colors"
    >
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={() => onToggleLayer(layer.id)}
            className="h-3.5 w-3.5 rounded border-border text-signal focus:ring-signal"
          />
          <span>{layer.title}</span>
        </label>
        <button
          type="button"
          onClick={() => onToggleLayer(layer.id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={layer.visible ? "Hide layer" : "Show layer"}
        >
          {layer.visible ? <Eye className="h-3.5 w-3.5 text-signal" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      </div>

      <p className="text-[0.68rem] text-muted-foreground">{layer.description}</p>

      {/* Opacity slider if visible */}
      {layer.visible && (
        <div className="mt-1 flex items-center gap-2 pt-1 border-t border-border/50">
          <span className="text-[0.65rem] text-muted-foreground w-12 shrink-0">
            Opacity: {Math.round(layer.opacity * 100)}%
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={layer.opacity}
            onChange={(e) => onChangeOpacity(layer.id, parseFloat(e.target.value))}
            className="h-1 flex-1 accent-signal cursor-pointer"
          />
        </div>
      )}
    </div>
  );

  return (
    <aside
      className={`absolute left-4 top-16 z-30 w-80 max-w-[calc(100%-2rem)] rounded-xl border border-border/80 bg-background/95 p-4 shadow-xl backdrop-blur-md select-none ${className}`}
      aria-label="Layer Visibility & Opacity Management"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-signal" />
          <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
            Layer Architecture
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close Layer Panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 max-h-[calc(100vh-16rem)] overflow-y-auto space-y-4 pr-1">
        {/* Domain 1: Operational */}
        {operationalLayers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-signal">
              <Shield className="h-3.5 w-3.5" />
              <span>Operational Layers (Live)</span>
            </div>
            <div className="space-y-1.5">{operationalLayers.map(renderLayerRow)}</div>
          </div>
        )}

        {/* Domain 2: Analytical */}
        {analyticalLayers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
              <Footprints className="h-3.5 w-3.5" />
              <span>Analytical & Reference</span>
            </div>
            <div className="space-y-1.5">{analyticalLayers.map(renderLayerRow)}</div>
          </div>
        )}

        {/* Domain 3: Simulation */}
        {simulationLayers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-amber-500">
              <Waves className="h-3.5 w-3.5" />
              <span>Simulation Lab Scenarios</span>
            </div>
            <div className="space-y-1.5">{simulationLayers.map(renderLayerRow)}</div>
          </div>
        )}
      </div>
    </aside>
  );
};
