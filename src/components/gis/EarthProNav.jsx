/**
 * EarthProNav — Google Earth Pro style navigation overlay for BeaconMesh
 *
 * Provides:
 * 1. Orbit Dial — continuously rotates heading and adjusts tilt with RAF
 * 2. Pan Joystick — omnidirectional continuous panning with RAF
 * 3. Zoom Track — smooth +/- zoom buttons and track
 * 4. Dynamic Compass — shows North heading orientation; click to reset North
 * 5. GPS Locate — flies to real device GPS position
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { Plus, Minus, Move, LocateFixed, Compass } from "lucide-react";
export function EarthProNav({ view, is3D = false, onLocate, className = "" }) {
    const [currentZoom, setCurrentZoom] = useState(14);
    const [currentHeading, setCurrentHeading] = useState(0);
    const [isLocating, setIsLocating] = useState(false);
    // RAF handles
    const animFrameRef = useRef(null);
    // Joystick drag state
    const joystickRef = useRef(null);
    const [joystickActive, setJoystickActive] = useState(false);
    const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
    const panDeltaRef = useRef({ dx: 0, dy: 0 });
    // Orbit rotation state
    const orbitActiveRef = useRef(false);
    const orbitDeltaRef = useRef({ dHeading: 0, dTilt: 0 });
    // Watch view zoom and heading
    useEffect(() => {
        if (!view)
            return;
        let zoomHandle = null;
        let headingHandle = null;
        try {
            zoomHandle = reactiveUtils.watch(() => view.zoom, (z) => {
                if (typeof z === "number")
                    setCurrentZoom(Math.round(z * 10) / 10);
            });
            headingHandle = reactiveUtils.watch(() => (view.type === "3d" ? view.camera?.heading || 0 : view.rotation || 0), (h) => {
                if (typeof h === "number")
                    setCurrentHeading(Math.round(h));
            });
        }
        catch (e) {
            console.warn("Could not attach reactive watch handles:", e);
        }
        return () => {
            zoomHandle?.remove();
            headingHandle?.remove();
        };
    }, [view]);
    // Continuous animation loop for pan & orbit
    const startAnimLoop = useCallback(() => {
        if (animFrameRef.current !== null)
            return;
        const tick = () => {
            if (!view) {
                animFrameRef.current = null;
                return;
            }
            let keepGoing = false;
            // Handle pan joystick movement
            if (joystickActive && (panDeltaRef.current.dx !== 0 || panDeltaRef.current.dy !== 0)) {
                keepGoing = true;
                const scaleFactor = 0.00003 * Math.pow(2, 20 - Math.min(Math.max(view.zoom || 14, 2), 20));
                const deltaX = panDeltaRef.current.dx * scaleFactor;
                const deltaY = -panDeltaRef.current.dy * scaleFactor;
                if (view.center) {
                    const newLng = view.center.longitude + deltaX;
                    const newLat = Math.min(Math.max(view.center.latitude + deltaY, -85), 85);
                    view.center = {
                        ...view.center,
                        longitude: newLng,
                        latitude: newLat,
                    };
                }
            }
            // Handle orbit dial continuous rotation
            if (orbitActiveRef.current && (orbitDeltaRef.current.dHeading !== 0 || orbitDeltaRef.current.dTilt !== 0)) {
                keepGoing = true;
                if (view.type === "3d") {
                    const sView = view;
                    const cam = sView.camera.clone();
                    if (orbitDeltaRef.current.dHeading !== 0) {
                        cam.heading = (cam.heading + orbitDeltaRef.current.dHeading + 360) % 360;
                    }
                    if (orbitDeltaRef.current.dTilt !== 0) {
                        cam.tilt = Math.min(Math.max(cam.tilt + orbitDeltaRef.current.dTilt, 0), 75);
                    }
                    sView.camera = cam;
                }
                else {
                    const mView = view;
                    if (orbitDeltaRef.current.dHeading !== 0) {
                        mView.rotation = (mView.rotation + orbitDeltaRef.current.dHeading + 360) % 360;
                    }
                }
            }
            if (keepGoing) {
                animFrameRef.current = requestAnimationFrame(tick);
            }
            else {
                animFrameRef.current = null;
            }
        };
        animFrameRef.current = requestAnimationFrame(tick);
    }, [view, joystickActive]);
    // Stop animation loop
    const stopAnimLoop = useCallback(() => {
        if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
    }, []);
    // Joystick pointer events
    const handleJoystickPointerDown = (e) => {
        e.preventDefault();
        setJoystickActive(true);
        e.target.setPointerCapture(e.pointerId);
    };
    const handleJoystickPointerMove = (e) => {
        if (!joystickActive || !joystickRef.current)
            return;
        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const rawDx = e.clientX - centerX;
        const rawDy = e.clientY - centerY;
        const maxR = rect.width / 2 - 12;
        const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
        const clampedDist = Math.min(dist, maxR);
        const angle = Math.atan2(rawDy, rawDx);
        const x = Math.cos(angle) * clampedDist;
        const y = Math.sin(angle) * clampedDist;
        setJoystickPos({ x, y });
        panDeltaRef.current = { dx: x / maxR, dy: y / maxR };
        startAnimLoop();
    };
    const handleJoystickPointerUp = (e) => {
        setJoystickActive(false);
        setJoystickPos({ x: 0, y: 0 });
        panDeltaRef.current = { dx: 0, dy: 0 };
        stopAnimLoop();
        try {
            e.target.releasePointerCapture(e.pointerId);
        }
        catch { }
    };
    // Orbit button handlers
    const startOrbit = (dHeading, dTilt = 0) => {
        orbitActiveRef.current = true;
        orbitDeltaRef.current = { dHeading, dTilt };
        startAnimLoop();
    };
    const stopOrbit = () => {
        orbitActiveRef.current = false;
        orbitDeltaRef.current = { dHeading: 0, dTilt: 0 };
        stopAnimLoop();
    };
    // Reset North
    const handleResetNorth = () => {
        if (!view)
            return;
        if (view.type === "3d") {
            const sView = view;
            const cam = sView.camera.clone();
            cam.heading = 0;
            sView.goTo(cam, { duration: 500 });
        }
        else {
            view.goTo({ rotation: 0 }, { duration: 500 });
        }
    };
    // Zoom handlers
    const handleZoomIn = () => {
        if (!view)
            return;
        view.goTo({ zoom: (view.zoom || 14) + 1 }, { duration: 300 });
    };
    const handleZoomOut = () => {
        if (!view)
            return;
        view.goTo({ zoom: (view.zoom || 14) - 1 }, { duration: 300 });
    };
    // Real GPS locate
    const handleGPSLocate = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition((pos) => {
            setIsLocating(false);
            const { latitude, longitude } = pos.coords;
            if (onLocate)
                onLocate([longitude, latitude]);
            if (view) {
                view.goTo({ center: [longitude, latitude], zoom: 16 }, { duration: 1500 });
            }
        }, (err) => {
            setIsLocating(false);
            alert(`Could not acquire GPS position: ${err.message}`);
        }, { enableHighAccuracy: true, timeout: 8000 });
    };
    return (<div aria-label="GIS Map Navigation Controls" className={`flex flex-col items-center gap-3 select-none pointer-events-auto ${className}`}>
      {/* 1. Orbit Dial (Heading & 3D Tilt) */}
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-border/80 bg-background/90 p-1 shadow-lg backdrop-blur">
        {/* Dynamic North Reset Needle */}
        <button type="button" onClick={handleResetNorth} title="Reset orientation to North" aria-label="Reset North heading" className="absolute z-10 flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground shadow transition-transform hover:scale-105 active:scale-95">
          <Compass className="h-4 w-4 text-urgent transition-transform" style={{ transform: `rotate(${-currentHeading}deg)` }}/>
        </button>

        {/* Orbit Left */}
        <button type="button" onMouseDown={() => startOrbit(1.5, 0)} onMouseUp={stopOrbit} onMouseLeave={stopOrbit} onTouchStart={() => startOrbit(1.5, 0)} onTouchEnd={stopOrbit} title="Rotate view clockwise" aria-label="Rotate clockwise" className="absolute left-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
          ◀
        </button>

        {/* Orbit Right */}
        <button type="button" onMouseDown={() => startOrbit(-1.5, 0)} onMouseUp={stopOrbit} onMouseLeave={stopOrbit} onTouchStart={() => startOrbit(-1.5, 0)} onTouchEnd={stopOrbit} title="Rotate view counter-clockwise" aria-label="Rotate counter-clockwise" className="absolute right-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
          ▶
        </button>

        {/* Tilt Up (3D only) */}
        {is3D && (<button type="button" onMouseDown={() => startOrbit(0, -1)} onMouseUp={stopOrbit} onMouseLeave={stopOrbit} onTouchStart={() => startOrbit(0, -1)} onTouchEnd={stopOrbit} title="Tilt camera down" aria-label="Tilt camera down" className="absolute top-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
            ▲
          </button>)}

        {/* Tilt Down (3D only) */}
        {is3D && (<button type="button" onMouseDown={() => startOrbit(0, 1)} onMouseUp={stopOrbit} onMouseLeave={stopOrbit} onTouchStart={() => startOrbit(0, 1)} onTouchEnd={stopOrbit} title="Tilt camera up" aria-label="Tilt camera up" className="absolute bottom-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
            ▼
          </button>)}
      </div>

      {/* 2. Pan Joystick */}
      <div ref={joystickRef} onPointerDown={handleJoystickPointerDown} onPointerMove={handleJoystickPointerMove} onPointerUp={handleJoystickPointerUp} onPointerCancel={handleJoystickPointerUp} title="Drag joystick to pan omnidirectionally" aria-label="Pan joystick" className="relative flex h-16 w-16 cursor-grab items-center justify-center rounded-full border border-border/80 bg-background/90 shadow-md backdrop-blur active:cursor-grabbing">
        <div className="pointer-events-none absolute flex h-7 w-7 items-center justify-center rounded-full bg-signal text-white shadow-md transition-transform" style={{
            transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
        }}>
          <Move className="h-3.5 w-3.5"/>
        </div>
      </div>

      {/* 3. Zoom Controls & GPS Locate */}
      <div className="flex flex-col items-center overflow-hidden rounded-lg border border-border/80 bg-background/90 shadow-md backdrop-blur">
        <button type="button" onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted active:bg-muted/80">
          <Plus className="h-4 w-4"/>
        </button>
        <div className="h-[1px] w-full bg-border"/>
        <button type="button" onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted active:bg-muted/80">
          <Minus className="h-4 w-4"/>
        </button>
        <div className="h-[1px] w-full bg-border"/>
        <button type="button" onClick={handleGPSLocate} disabled={isLocating} title="Fly to real device GPS position" aria-label="Locate device GPS position" className={`flex h-8 w-8 items-center justify-center text-foreground hover:bg-muted active:bg-muted/80 ${isLocating ? "animate-pulse text-signal" : ""}`}>
          <LocateFixed className="h-4 w-4"/>
        </button>
      </div>
    </div>);
}
