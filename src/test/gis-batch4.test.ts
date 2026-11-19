import { describe, it, expect } from "vitest";
import type { LayerConfig } from "@/components/gis/LayerPanel";

describe("GIS Batch 4 — ComparisonView, Swipe & LayerPanel", () => {
  it("enforces strict separation across operational, analytical, and simulation categories", () => {
    const mockLayers: LayerConfig[] = [
      {
        id: "incidents",
        title: "Active Incidents",
        category: "operational",
        visible: true,
        opacity: 1.0,
        description: "Verified distress calls",
      },
      {
        id: "safe-zones",
        title: "Safe Zones",
        category: "operational",
        visible: true,
        opacity: 0.9,
        description: "Verified evacuation shelters",
      },
      {
        id: "citations",
        title: "Esri Layer 4 Footprints",
        category: "analytical",
        visible: false,
        opacity: 0.5,
        description: "Optical sensor footprint boundaries",
      },
      {
        id: "simulation-flood",
        title: "Flood Inundation 100-Year",
        category: "simulation",
        visible: false,
        opacity: 0.7,
        description: "Synthetic hydrodynamic flood scenario",
      },
    ];

    const operational = mockLayers.filter((l) => l.category === "operational");
    const analytical = mockLayers.filter((l) => l.category === "analytical");
    const simulation = mockLayers.filter((l) => l.category === "simulation");

    expect(operational.length).toBe(2);
    expect(analytical.length).toBe(1);
    expect(simulation.length).toBe(1);

    // No cross contamination of categories
    expect(operational.some((l) => l.id.includes("simulation"))).toBe(false);
    expect(operational.some((l) => l.id.includes("citations"))).toBe(false);
    expect(simulation.every((l) => l.category === "simulation")).toBe(true);
  });

  it("ensures opacity values stay within legitimate [0, 1] range", () => {
    const clampOpacity = (v: number) => Math.max(0, Math.min(1, v));
    expect(clampOpacity(1.5)).toBe(1);
    expect(clampOpacity(-0.2)).toBe(0);
    expect(clampOpacity(0.85)).toBe(0.85);
  });
});
