import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { HeroCinematicAnimation, HERO_NODES, HERO_PATHS } from "../components/beaconmesh/hero-cinematic-animation";

describe("HeroCinematicAnimation", () => {
  it("defines the 5-stage network topology nodes correctly", () => {
    expect(HERO_NODES.responder).toBeDefined();
    expect(HERO_NODES.responder.role).toBe("origin");
    expect(HERO_NODES.ridgeRelay).toBeDefined();
    expect(HERO_NODES.slopePass).toBeDefined();
    expect(HERO_NODES.horizonBeacon).toBeDefined();
    expect(HERO_NODES.horizonBeacon.role).toBe("beacon");
    expect(HERO_NODES.coastalOverlook).toBeDefined();
    expect(HERO_NODES.harborLink).toBeDefined();
    expect(HERO_NODES.bluffBase).toBeDefined();
  });

  it("defines interconnecting mesh paths across all stages", () => {
    expect(HERO_PATHS.length).toBeGreaterThanOrEqual(7);
    const stages = new Set(HERO_PATHS.map((p) => p.stage));
    expect(stages.has("stage-3")).toBe(true);
    expect(stages.has("stage-4")).toBe(true);
    expect(stages.has("stage-5")).toBe(true);
  });

  it("renders the cinematic overlay with radio pulses, nodes, and SVG canvas", () => {
    const { container } = render(<HeroCinematicAnimation />);
    const overlay = container.querySelector(".hero-cinematic-overlay");
    expect(overlay).not.toBeNull();

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1000 600");

    // Stage 2 radio search waves
    const radioWaves = container.querySelectorAll(".radio-wave");
    expect(radioWaves.length).toBe(3);

    // Horizon beacon waves & node
    const beaconNode = container.querySelector(".node-beacon-horizon");
    expect(beaconNode).not.toBeNull();
    const beaconWaves = container.querySelectorAll(".beacon-wave");
    expect(beaconWaves.length).toBe(2);

    // Mesh paths and travelling signal packets
    const pathBases = container.querySelectorAll(".mesh-path-base");
    expect(pathBases.length).toBe(HERO_PATHS.length);
    const signalPackets = container.querySelectorAll(".mesh-signal-packet");
    expect(signalPackets.length).toBe(HERO_PATHS.length);
  });

  it("supports prefers-reduced-motion gracefully", () => {
    // Mock matchMedia for reduced-motion
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(<HeroCinematicAnimation />);
    const overlay = container.querySelector(".hero-cinematic-overlay");
    expect(overlay?.classList.contains("reduced-motion")).toBe(true);
  });
});
