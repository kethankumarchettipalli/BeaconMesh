import React, { useState, useEffect, useRef, useCallback } from "react";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import { Layers, Eye, Ruler, Columns, LocateFixed, RefreshCw, } from "lucide-react";
import { ROLE_GIS_POLICIES, DEFAULT_GIS_VIEW, } from "@/lib/gis/gis-config";
import { MapViewContainer } from "./MapViewContainer";
import { SceneViewContainer } from "./SceneViewContainer";
import { CommandModeSelector } from "./CommandModeSelector";
import { CoordinateHUD } from "./CoordinateHUD";
import { ImageryInspector } from "./ImageryInspector";
import { LayerPanel } from "./LayerPanel";
import { ComparisonView } from "./ComparisonView";
import { MeasurementTools } from "./MeasurementTools";
import { getDeviceLocation } from "@/lib/gis/geolocation-service";
import { INITIAL_SAFE_ZONES } from "@/lib/services/safezone-service";
export const BeaconMapConsole = ({ role = "CITIZEN", incidents = [], safeZones = INITIAL_SAFE_ZONES, activeUserId, className = "", compact = false, }) => {
    const policy = ROLE_GIS_POLICIES[role] || ROLE_GIS_POLICIES.CITIZEN;
    // Mode States
    const [dimension, setDimension] = useState(policy.allowedDimensions.includes("3d") ? "2d" : "2d");
    const [basemapMode, setBasemapMode] = useState("satellite");
    // Panel States
    const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const [isMeasurementOpen, setIsMeasurementOpen] = useState(false);
    const [isComparisonOpen, setIsComparisonOpen] = useState(false);
    const [isInspectionMode, setIsInspectionMode] = useState(false);
    const [isOverzoomAllowed, setIsOverzoomAllowed] = useState(false);
    // View States
    const [viewState, setViewState] = useState({
        center: DEFAULT_GIS_VIEW.center,
        zoom: DEFAULT_GIS_VIEW.zoom,
        scale: 18056,
        rotation: 0,
    });
    const [viewRevision, setViewRevision] = useState(0);
    const [activeInspectPoint, setActiveInspectPoint] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsMessage, setGpsMessage] = useState(null);
    // Active view reference (MapView or SceneView)
    const currentViewRef = useRef(null);
    const operationalLayersRef = useRef({
        safeZonesLayer: null,
        incidentsLayer: null,
        simulationLayer: null,
    });
    // Layer Configuration State
    const [layerConfigs, setLayerConfigs] = useState([
        {
            id: "safe-zones",
            title: "Verified Safe Zones",
            category: "operational",
            visible: true,
            opacity: 1.0,
            description: "Designated civic emergency relief shelters and trauma centres",
        },
        {
            id: "distress-incidents",
            title: "Distress Incident Markers",
            category: "operational",
            visible: true,
            opacity: 1.0,
            description: "SOS calls and reported hazards across operational sectors",
        },
        {
            id: "simulation-flood",
            title: "Krishna Inundation (Simulation Scenario)",
            category: "simulation",
            visible: false,
            opacity: 0.65,
            description: "Illustrative hydrological scenario for simulation training only — NOT an operational flood forecast",
        },
    ]);
    // Handle Layer Visibility Toggle
    const handleToggleLayer = (layerId) => {
        setLayerConfigs((prev) => prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)));
    };
    // Handle Layer Opacity Change
    const handleChangeOpacity = (layerId, opacity) => {
        setLayerConfigs((prev) => prev.map((l) => (l.id === layerId ? { ...l, opacity } : l)));
    };
    // Synchronize graphics layers on view ready
    const handleViewReady = useCallback((view) => {
        currentViewRef.current = view;
        // 1. Safe Zones GraphicsLayer
        const szLayer = new GraphicsLayer({
            id: "beacon-safezones-graphics",
            title: "Verified Safe Zones",
            listMode: "show",
        });
        // 2. Incidents GraphicsLayer
        const incLayer = new GraphicsLayer({
            id: "beacon-incidents-graphics",
            title: "Distress Incidents",
            listMode: "show",
        });
        // 3. Simulation GraphicsLayer (clearly labeled as illustrative simulation)
        const simLayer = new GraphicsLayer({
            id: "beacon-simulation-graphics",
            title: "Flood Simulation (Illustrative Only)",
            listMode: "show",
            visible: false,
            opacity: 0.65,
        });
        view.map.addMany([szLayer, incLayer, simLayer]);
        operationalLayersRef.current = {
            safeZonesLayer: szLayer,
            incidentsLayer: incLayer,
            simulationLayer: simLayer,
        };
        setViewRevision((r) => r + 1);
    }, []);
    // Update Safe Zone Graphics when safeZones or viewRevision changes
    useEffect(() => {
        const layer = operationalLayersRef.current.safeZonesLayer;
        if (!layer)
            return;
        layer.removeAll();
        safeZones.forEach((sz) => {
            const lat = sz.location?.latitude;
            const lon = sz.location?.longitude;
            if (typeof lat !== "number" || typeof lon !== "number")
                return;
            const isMedical = sz.facilities?.some((f) => f.toLowerCase().includes("medical") || f.toLowerCase().includes("hospital"));
            const point = new Point({ latitude: lat, longitude: lon });
            const graphic = new Graphic({
                geometry: point,
                symbol: {
                    type: "simple-marker",
                    style: "circle",
                    color: isMedical ? [16, 185, 129, 0.9] : [34, 197, 94, 0.9], // Safe emerald / green
                    size: 14,
                    outline: {
                        color: [255, 255, 255, 1],
                        width: 2,
                    },
                },
                attributes: {
                    name: sz.name,
                    facilityType: isMedical ? "Public Medical Care & Trauma Centre" : "Civic Emergency Shelter",
                    capacity: sz.capacity ? `${sz.availableCapacity ?? sz.capacity} / ${sz.capacity}` : "Standby",
                    status: sz.operationalStatus,
                    provenance: sz.sourceName || "Municipal Civil Defense",
                },
                popupTemplate: {
                    title: "{name}",
                    content: `
            <div style="font-size: 12px; font-family: sans-serif; line-height: 1.4;">
              <p><strong>Designation:</strong> {facilityType}</p>
              <p><strong>Operational Status:</strong> {status}</p>
              <p><strong>Available Capacity:</strong> {capacity}</p>
              <p style="color: #64748b; font-size: 11px; margin-top: 4px;">Source: {provenance}</p>
            </div>
          `,
                },
            });
            layer.add(graphic);
        });
    }, [safeZones, viewRevision]);
    // Update Incident Graphics when incidents or viewRevision changes
    useEffect(() => {
        const layer = operationalLayersRef.current.incidentsLayer;
        if (!layer)
            return;
        layer.removeAll();
        // Enforce role-based privacy
        const filteredIncidents = role === "CITIZEN"
            ? incidents.filter((inc) => inc.reportedBy === activeUserId)
            : incidents;
        filteredIncidents.forEach((inc) => {
            const lat = inc.location?.latitude;
            const lon = inc.location?.longitude;
            if (typeof lat !== "number" || typeof lon !== "number")
                return;
            const isCritical = inc.severity === "CRITICAL";
            const markerColor = isCritical ? [239, 68, 68, 0.9] : [245, 158, 11, 0.9]; // red vs amber
            const point = new Point({ latitude: lat, longitude: lon });
            const graphic = new Graphic({
                geometry: point,
                symbol: {
                    type: "simple-marker",
                    style: "circle",
                    color: markerColor,
                    size: isCritical ? 16 : 12,
                    outline: {
                        color: [255, 255, 255, 1],
                        width: 2,
                    },
                },
                attributes: {
                    id: inc.id,
                    title: inc.title || inc.category,
                    severity: inc.severity,
                    status: inc.status,
                    description: inc.description || "No description provided.",
                },
                popupTemplate: {
                    title: "{title} ({severity})",
                    content: `
            <div style="font-size: 12px; font-family: sans-serif;">
              <p><strong>Incident ID:</strong> {id}</p>
              <p><strong>Status:</strong> {status}</p>
              <p style="margin-top: 4px;">{description}</p>
            </div>
          `,
                },
            });
            layer.add(graphic);
        });
    }, [incidents, role, activeUserId, viewRevision]);
    // Draw Krishna Flood Simulation polygon (explicitly labeled illustrative simulation)
    useEffect(() => {
        const layer = operationalLayersRef.current.simulationLayer;
        if (!layer)
            return;
        layer.removeAll();
        // Illustrative inundation polygon covering Krishna river corridor in Vijayawada
        const floodPolygon = new Polygon({
            rings: [
                [
                    [80.570, 16.510],
                    [80.590, 16.525],
                    [80.615, 16.520],
                    [80.635, 16.505],
                    [80.650, 16.495],
                    [80.630, 16.485],
                    [80.600, 16.500],
                    [80.570, 16.510],
                ],
            ],
        });
        const floodGraphic = new Graphic({
            geometry: floodPolygon,
            symbol: {
                type: "simple-fill",
                color: [59, 130, 246, 0.35], // Blue inundation
                outline: {
                    color: [37, 99, 235, 1],
                    width: 2,
                },
            },
            attributes: {
                scenario: "SIMULATION LAB: Krishna Basin Inundation Scenario",
                classification: "Illustrative Simulation Scenario",
                disclaimer: "FOR SIMULATION TESTING ONLY. Not a real-time, verified, or operational disaster warning.",
                waterLevel: "+4.2m above seasonal datum (Simulated)",
            },
            popupTemplate: {
                title: "{scenario}",
                content: `
          <div style="font-size: 12px; font-family: sans-serif; line-height: 1.4;">
            <p style="color: #b45309; font-weight: bold; margin-bottom: 4px;">⚠️ {classification}</p>
            <p style="margin-bottom: 6px;">{disclaimer}</p>
            <p><strong>Modeled Inundation:</strong> {waterLevel}</p>
          </div>
        `,
            },
        });
        layer.add(floodGraphic);
    }, [viewRevision]);
    // Sync layer visibility & opacity from state
    useEffect(() => {
        const { safeZonesLayer, incidentsLayer, simulationLayer } = operationalLayersRef.current;
        layerConfigs.forEach((cfg) => {
            if (cfg.id === "safe-zones" && safeZonesLayer) {
                safeZonesLayer.visible = cfg.visible;
                safeZonesLayer.opacity = cfg.opacity;
            }
            if (cfg.id === "distress-incidents" && incidentsLayer) {
                incidentsLayer.visible = cfg.visible;
                incidentsLayer.opacity = cfg.opacity;
            }
            if (cfg.id === "simulation-flood" && simulationLayer) {
                simulationLayer.visible = cfg.visible;
                simulationLayer.opacity = cfg.opacity;
            }
        });
    }, [layerConfigs]);
    // Map Click handler (Inspection mode click)
    const handleMapClick = (coords) => {
        if (isInspectionMode || isInspectorOpen) {
            setActiveInspectPoint(coords);
            setIsInspectorOpen(true);
        }
    };
    // Center inspect handler
    const handleInspectCenter = () => {
        setActiveInspectPoint(viewState.center);
        setIsInspectorOpen(true);
    };
    // GPS Locate handler
    const handleLocateUser = async () => {
        setGpsLoading(true);
        setGpsMessage(null);
        const res = await getDeviceLocation();
        setGpsLoading(false);
        if (res.success && res.coords && currentViewRef.current) {
            const { latitude, longitude } = res.coords;
            void currentViewRef.current.goTo({
                center: [longitude, latitude],
                zoom: 17,
            });
            setGpsMessage(`Located: ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E (±${Math.round(res.coords.accuracy)}m)`);
            setTimeout(() => setGpsMessage(null), 4000);
        }
        else {
            setGpsMessage(res.error?.message || "Location access denied or unavailable.");
            setTimeout(() => setGpsMessage(null), 4000);
        }
    };
    return (<div className={`relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm ${compact ? "min-h-[260px] h-64" : "h-full min-h-[500px]"} ${className}`}>
      {/* 2D vs 3D Viewport Switching */}
      {!compact && dimension === "3d" && policy.allowedDimensions.includes("3d") ? (<SceneViewContainer basemapMode={basemapMode} onViewStateChange={setViewState} onMapClick={handleMapClick} onViewReady={handleViewReady}/>) : (<MapViewContainer basemapMode={basemapMode} onViewStateChange={setViewState} onMapClick={handleMapClick} onInspectCenter={handleInspectCenter} isInspectionMode={isInspectionMode} onToggleInspectionMode={() => setIsInspectionMode(!isInspectionMode)} isOverzoomAllowed={isOverzoomAllowed} onToggleOverzoom={() => setIsOverzoomAllowed(!isOverzoomAllowed)} showControls={!compact} onViewReady={handleViewReady}/>)}

      {/* Compact Viewport Header vs Full Top Floating Control Bar */}
      {compact ? (<div className="absolute inset-x-3 top-3 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-md border border-border/80 bg-background/95 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-md pointer-events-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-safe animate-pulse"/>
            <span>Live Geography · Vijayawada</span>
          </div>
          <a href={role === "COMMAND"
                ? "/command/map"
                : role === "RESPONDER"
                    ? "/responder/field-map"
                    : "/citizen/safe-zones"} className="flex items-center gap-1 rounded-md border border-signal/40 bg-signal/90 px-2.5 py-1 text-xs font-semibold text-white shadow hover:bg-signal transition-colors pointer-events-auto">
            <span>Open Map Console</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>) : (
        /* Top Floating Control Bar */
        <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2">
        {/* Mode Selector */}
        {role === "COMMAND" ? (<CommandModeSelector basemapMode={basemapMode} dimension={dimension} onBasemapChange={setBasemapMode} onDimensionChange={setDimension} allowedBasemaps={policy.allowedBasemaps} allowedDimensions={policy.allowedDimensions}/>) : (<div className="flex items-center rounded-lg border border-border/80 bg-background/95 p-1 shadow-md backdrop-blur-md">
            <button type="button" onClick={() => setBasemapMode("satellite")} className={`rounded px-2.5 py-1 text-xs font-semibold ${basemapMode === "satellite" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"}`}>
              Satellite
            </button>
            <button type="button" onClick={() => setBasemapMode("streets")} className={`rounded px-2.5 py-1 text-xs font-semibold ${basemapMode === "streets" ? "bg-signal text-white" : "text-muted-foreground hover:text-foreground"}`}>
              Streets
            </button>
          </div>)}

        {/* Layer Panel Button */}
        <button type="button" onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)} className={`flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/95 px-2.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition-colors ${isLayerPanelOpen ? "border-signal text-signal" : "text-foreground hover:bg-muted"}`} title="Toggle Operational Layers Panel">
          <Layers className="h-3.5 w-3.5"/>
          <span>Layers</span>
        </button>

        {/* Imagery Inspector Button (Command & Responder) */}
        {policy.hasInspector && (<button type="button" onClick={() => {
                    if (!isInspectorOpen && !activeInspectPoint) {
                        setActiveInspectPoint(viewState.center);
                    }
                    setIsInspectorOpen(!isInspectorOpen);
                }} className={`flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/95 px-2.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition-colors ${isInspectorOpen ? "border-signal text-signal" : "text-foreground hover:bg-muted"}`} title="Inspect Optical Imagery & Citations">
            <Eye className="h-3.5 w-3.5"/>
            <span>Inspector</span>
          </button>)}

        {/* Measurement Tools (Command Only) */}
        {policy.hasSketchMeasurement && (<button type="button" onClick={() => setIsMeasurementOpen(!isMeasurementOpen)} className={`flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/95 px-2.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition-colors ${isMeasurementOpen ? "border-signal text-signal" : "text-foreground hover:bg-muted"}`} title="Geodesic Distance & Area Measurement">
            <Ruler className="h-3.5 w-3.5"/>
            <span>Measure</span>
          </button>)}

        {/* Dual Comparison & Swipe (Command Only) */}
        {policy.hasComparisonSwipe && (<button type="button" onClick={() => setIsComparisonOpen(!isComparisonOpen)} className={`flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/95 px-2.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition-colors ${isComparisonOpen ? "border-signal text-signal" : "text-foreground hover:bg-muted"}`} title="Side-by-Side Dual View & Swipe Comparison">
            <Columns className="h-3.5 w-3.5"/>
            <span>Comparison</span>
          </button>)}

        {/* Real Device GPS Locate Button */}
        <button type="button" onClick={handleLocateUser} disabled={gpsLoading} className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur-md hover:bg-muted transition-colors disabled:opacity-50" title="Locate via Real Device GPS">
          {gpsLoading ? (<RefreshCw className="h-3.5 w-3.5 animate-spin text-signal"/>) : (<LocateFixed className="h-3.5 w-3.5 text-signal"/>)}
          <span>GPS</span>
        </button>

        {gpsMessage && (<div className="rounded-lg border border-border bg-background/95 px-2.5 py-1 text-[0.7rem] font-medium text-foreground shadow-md backdrop-blur-md">
            {gpsMessage}
          </div>)}
      </div>)}

      {/* Floating Coordinate HUD */}
      {!compact && <CoordinateHUD viewState={viewState} dimension={dimension}/>}

      {/* Layer Panel Modal */}
      {!compact && (<LayerPanel isOpen={isLayerPanelOpen} onClose={() => setIsLayerPanelOpen(false)} layers={layerConfigs} onToggleLayer={handleToggleLayer} onChangeOpacity={handleChangeOpacity}/>)}

      {/* Imagery Inspector Panel */}
      {!compact && (<ImageryInspector isOpen={isInspectorOpen} onClose={() => setIsInspectorOpen(false)} activePoint={activeInspectPoint} currentZoom={viewState.zoom} currentScale={viewState.scale} onInspectCenter={handleInspectCenter} onSnapToNativeLimit={() => {
                if (currentViewRef.current) {
                    void currentViewRef.current.goTo({ zoom: 19 });
                }
            }}/>)}

      {/* Geodesic Measurement Tools */}
      {!compact && (<MeasurementTools view={currentViewRef.current} isOpen={isMeasurementOpen} onClose={() => setIsMeasurementOpen(false)}/>)}

      {/* Dual Comparison Modal */}
      {!compact && (<ComparisonView isOpen={isComparisonOpen} onClose={() => setIsComparisonOpen(false)} initialCenter={viewState.center} initialZoom={viewState.zoom}/>)}
    </div>);
};
