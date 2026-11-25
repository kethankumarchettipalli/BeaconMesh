import React, { useEffect, useState } from "react";
/**
 * HeroCinematicAnimation
 *
 * Implements the 5-stage continuous cinematic emergency-network sequence:
 * STAGE 1 — ISOLATION: Subtle atmospheric movement, dark dramatic coastal environment.
 * STAGE 2 — SIGNAL SEARCH: Cyan radio signal pulses emitted from responder's device.
 * STAGE 3 — NODE DETECTION: Terrain relay nodes illuminate, thin paths draw in, signals propagate.
 * STAGE 4 — BEACON ACTIVATION: Warm orange horizon beacon triggers reciprocal connection.
 * STAGE 5 — NETWORK EXPANSION: Resilient mesh forms, multi-hop packet flow, ambient breathing loop.
 *
 * Respects prefers-reduced-motion by rendering a calm, static, fully-connected network.
 */
// Coordinates in 1000x600 viewBox, aligned with beaconmesh-hero.jpg features
export const HERO_NODES = {
    // Origin: Responder handheld radio antenna
    responder: { id: "node-responder", x: 812, y: 262, label: "UNIT-01 (ALPHA)", role: "origin" },
    // Stage 3 nodes: High ridge and mid-ground terrain relays
    ridgeRelay: { id: "node-ridge", x: 732, y: 342, label: "RIDGE RELAY", role: "relay" },
    slopePass: { id: "node-slope", x: 652, y: 388, label: "VALLEY PASS", role: "relay" },
    // Stage 4 node: Distant coastal beacon on horizon
    horizonBeacon: { id: "node-beacon", x: 574, y: 308, label: "BEACON-09 (HORIZON)", role: "beacon" },
    // Stage 5 nodes: Coastal community & perimeter links
    coastalOverlook: { id: "node-coastal", x: 486, y: 332, label: "COASTAL OUTPOST", role: "relay" },
    harborLink: { id: "node-harbor", x: 418, y: 378, label: "SHELTER LINK", role: "community" },
    bluffBase: { id: "node-bluff", x: 884, y: 442, label: "BLUFF SENSOR", role: "perimeter" },
};
// Mesh paths connecting the topology
export const HERO_PATHS = [
    // Primary propagation spine (Stages 2 -> 3 -> 4)
    {
        id: "path-resp-ridge",
        d: `M ${HERO_NODES.responder.x} ${HERO_NODES.responder.y} L ${HERO_NODES.ridgeRelay.x} ${HERO_NODES.ridgeRelay.y}`,
        length: 113,
        stage: "stage-3",
    },
    {
        id: "path-ridge-slope",
        d: `M ${HERO_NODES.ridgeRelay.x} ${HERO_NODES.ridgeRelay.y} L ${HERO_NODES.slopePass.x} ${HERO_NODES.slopePass.y}`,
        length: 93,
        stage: "stage-3",
    },
    {
        id: "path-slope-beacon",
        d: `M ${HERO_NODES.slopePass.x} ${HERO_NODES.slopePass.y} L ${HERO_NODES.horizonBeacon.x} ${HERO_NODES.horizonBeacon.y}`,
        length: 111,
        stage: "stage-4",
    },
    // Reciprocal beacon branch (Stage 4)
    {
        id: "path-beacon-coastal",
        d: `M ${HERO_NODES.horizonBeacon.x} ${HERO_NODES.horizonBeacon.y} L ${HERO_NODES.coastalOverlook.x} ${HERO_NODES.coastalOverlook.y}`,
        length: 91,
        stage: "stage-4",
    },
    // Mesh expansion links (Stage 5)
    {
        id: "path-coastal-harbor",
        d: `M ${HERO_NODES.coastalOverlook.x} ${HERO_NODES.coastalOverlook.y} L ${HERO_NODES.harborLink.x} ${HERO_NODES.harborLink.y}`,
        length: 81,
        stage: "stage-5",
    },
    {
        id: "path-slope-harbor",
        d: `M ${HERO_NODES.slopePass.x} ${HERO_NODES.slopePass.y} L ${HERO_NODES.harborLink.x} ${HERO_NODES.harborLink.y}`,
        length: 234,
        stage: "stage-5",
    },
    {
        id: "path-ridge-beacon",
        d: `M ${HERO_NODES.ridgeRelay.x} ${HERO_NODES.ridgeRelay.y} L ${HERO_NODES.horizonBeacon.x} ${HERO_NODES.horizonBeacon.y}`,
        length: 161,
        stage: "stage-5",
    },
    {
        id: "path-resp-bluff",
        d: `M ${HERO_NODES.responder.x} ${HERO_NODES.responder.y} L ${HERO_NODES.bluffBase.x} ${HERO_NODES.bluffBase.y}`,
        length: 194,
        stage: "stage-5",
    },
];
export function HeroCinematicAnimation() {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setPrefersReducedMotion(mq.matches);
        const onChange = (e) => setPrefersReducedMotion(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return (<div className={`hero-cinematic-overlay absolute inset-0 pointer-events-none select-none z-[4] ${prefersReducedMotion ? "reduced-motion" : ""}`} aria-hidden="true">
      {/* Subtle atmospheric mist light pulse across the landscape */}
      <div className="hero-atmospheric-mist absolute inset-0"/>

      {/* SVG Mesh and Waveform Canvas */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Subtle cyan glow filter for active signal lines and nodes */}
          <filter id="mesh-cyan-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Warm amber/orange glow filter for the distant horizon beacon */}
          <filter id="mesh-beacon-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Radial gradients for subtle node halos */}
          <radialGradient id="halo-cyan" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.72 0.13 205)" stopOpacity="0.8"/>
            <stop offset="45%" stopColor="oklch(0.72 0.13 205)" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="oklch(0.72 0.13 205)" stopOpacity="0"/>
          </radialGradient>

          <radialGradient id="halo-amber" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.68 0.18 45)" stopOpacity="0.95"/>
            <stop offset="35%" stopColor="oklch(0.68 0.18 45)" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="oklch(0.68 0.18 45)" stopOpacity="0"/>
          </radialGradient>
        </defs>

        {/* ========================================================= */}
        {/* STAGE 2: RADIO SEARCH PULSES (EMITTING FROM RESPONDER)   */}
        {/* ========================================================= */}
        <g className="radio-search-group">
          {/* Concentric directional radio signal arcs / pulses */}
          <circle cx={HERO_NODES.responder.x} cy={HERO_NODES.responder.y} r="12" className="radio-wave radio-wave-1"/>
          <circle cx={HERO_NODES.responder.x} cy={HERO_NODES.responder.y} r="12" className="radio-wave radio-wave-2"/>
          <circle cx={HERO_NODES.responder.x} cy={HERO_NODES.responder.y} r="12" className="radio-wave radio-wave-3"/>
        </g>

        {/* ========================================================= */}
        {/* STAGES 3 - 5: NETWORK CONNECTIVITY PATHS                 */}
        {/* ========================================================= */}
        <g className="mesh-paths-group">
          {HERO_PATHS.map((path) => (<React.Fragment key={path.id}>
              {/* Faint ambient baseline line (always present at low opacity for depth) */}
              <path d={path.d} className="mesh-path-base" stroke="oklch(0.72 0.13 205)" strokeWidth="1" strokeDasharray="3 4" strokeOpacity="0.18" fill="none"/>

              {/* Progressive drawing line (illuminates as signal traverses) */}
              <path d={path.d} className={`mesh-path-draw ${path.stage}`} stroke="oklch(0.74 0.14 205)" strokeWidth="1.5" strokeDasharray={path.length} strokeDashoffset={path.length} fill="none" filter="url(#mesh-cyan-glow)"/>

              {/* Travelling signal pulse packet zipping along the path */}
              <path d={path.d} className={`mesh-signal-packet ${path.stage}`} stroke="oklch(0.85 0.15 205)" strokeWidth="2.5" strokeDasharray={`10 ${path.length + 30}`} fill="none"/>
            </React.Fragment>))}
        </g>

        {/* ========================================================= */}
        {/* STAGES 3 - 5: NETWORK RELAY NODES                        */}
        {/* ========================================================= */}
        <g className="mesh-nodes-group">
          {/* Node 1: Responder Handheld Device Source */}
          <g className="hero-node-item node-source">
            <circle cx={HERO_NODES.responder.x} cy={HERO_NODES.responder.y} r="14" fill="url(#halo-cyan)" className="node-halo"/>
            <circle cx={HERO_NODES.responder.x} cy={HERO_NODES.responder.y} r="4" className="node-ring" stroke="oklch(0.72 0.13 205)" strokeWidth="1" fill="none"/>
            <circle cx={HERO_NODES.responder.x} cy={HERO_NODES.responder.y} r="2" fill="oklch(0.88 0.12 205)" className="node-core"/>
          </g>

          {/* Node 2: Ridge Relay (Stage 3) */}
          <g className="hero-node-item node-stage-3">
            <circle cx={HERO_NODES.ridgeRelay.x} cy={HERO_NODES.ridgeRelay.y} r="12" fill="url(#halo-cyan)" className="node-halo"/>
            <circle cx={HERO_NODES.ridgeRelay.x} cy={HERO_NODES.ridgeRelay.y} r="3.5" className="node-ring" stroke="oklch(0.72 0.13 205)" strokeWidth="1" fill="none"/>
            <circle cx={HERO_NODES.ridgeRelay.x} cy={HERO_NODES.ridgeRelay.y} r="2" fill="oklch(0.85 0.14 205)" className="node-core"/>
          </g>

          {/* Node 3: Slope Pass (Stage 3) */}
          <g className="hero-node-item node-stage-3-delayed">
            <circle cx={HERO_NODES.slopePass.x} cy={HERO_NODES.slopePass.y} r="12" fill="url(#halo-cyan)" className="node-halo"/>
            <circle cx={HERO_NODES.slopePass.x} cy={HERO_NODES.slopePass.y} r="3.5" className="node-ring" stroke="oklch(0.72 0.13 205)" strokeWidth="1" fill="none"/>
            <circle cx={HERO_NODES.slopePass.x} cy={HERO_NODES.slopePass.y} r="2" fill="oklch(0.85 0.14 205)" className="node-core"/>
          </g>

          {/* ======================================================= */}
          {/* STAGE 4: DISTANT HORIZON BEACON (WARM AMBER / ORANGE)   */}
          {/* ======================================================= */}
          <g className="hero-node-item node-beacon-horizon">
            {/* Concentric beacon pulse wavelets */}
            <circle cx={HERO_NODES.horizonBeacon.x} cy={HERO_NODES.horizonBeacon.y} r="8" className="beacon-wave beacon-wave-1"/>
            <circle cx={HERO_NODES.horizonBeacon.x} cy={HERO_NODES.horizonBeacon.y} r="8" className="beacon-wave beacon-wave-2"/>
            {/* Beacon soft atmospheric halo */}
            <circle cx={HERO_NODES.horizonBeacon.x} cy={HERO_NODES.horizonBeacon.y} r="22" fill="url(#halo-amber)" className="beacon-halo" filter="url(#mesh-beacon-glow)"/>
            <circle cx={HERO_NODES.horizonBeacon.x} cy={HERO_NODES.horizonBeacon.y} r="5" className="beacon-ring" stroke="oklch(0.68 0.18 45)" strokeWidth="1.2" fill="none"/>
            <circle cx={HERO_NODES.horizonBeacon.x} cy={HERO_NODES.horizonBeacon.y} r="2.5" fill="oklch(0.92 0.15 55)" className="beacon-core"/>
          </g>

          {/* Node 5: Coastal Overlook (Stage 4) */}
          <g className="hero-node-item node-stage-4">
            <circle cx={HERO_NODES.coastalOverlook.x} cy={HERO_NODES.coastalOverlook.y} r="11" fill="url(#halo-cyan)" className="node-halo"/>
            <circle cx={HERO_NODES.coastalOverlook.x} cy={HERO_NODES.coastalOverlook.y} r="3.5" className="node-ring" stroke="oklch(0.72 0.13 205)" strokeWidth="1" fill="none"/>
            <circle cx={HERO_NODES.coastalOverlook.x} cy={HERO_NODES.coastalOverlook.y} r="1.8" fill="oklch(0.85 0.14 205)" className="node-core"/>
          </g>

          {/* Node 6: Harbor Shelter Link (Stage 5) */}
          <g className="hero-node-item node-stage-5">
            <circle cx={HERO_NODES.harborLink.x} cy={HERO_NODES.harborLink.y} r="10" fill="url(#halo-cyan)" className="node-halo"/>
            <circle cx={HERO_NODES.harborLink.x} cy={HERO_NODES.harborLink.y} r="3" className="node-ring" stroke="oklch(0.72 0.13 205)" strokeWidth="1" fill="none"/>
            <circle cx={HERO_NODES.harborLink.x} cy={HERO_NODES.harborLink.y} r="1.6" fill="oklch(0.85 0.14 205)" className="node-core"/>
          </g>

          {/* Node 7: Bluff Base Sensor (Stage 5) */}
          <g className="hero-node-item node-stage-5">
            <circle cx={HERO_NODES.bluffBase.x} cy={HERO_NODES.bluffBase.y} r="10" fill="url(#halo-cyan)" className="node-halo"/>
            <circle cx={HERO_NODES.bluffBase.x} cy={HERO_NODES.bluffBase.y} r="3" className="node-ring" stroke="oklch(0.72 0.13 205)" strokeWidth="1" fill="none"/>
            <circle cx={HERO_NODES.bluffBase.x} cy={HERO_NODES.bluffBase.y} r="1.6" fill="oklch(0.85 0.14 205)" className="node-core"/>
          </g>
        </g>
      </svg>
    </div>);
}
