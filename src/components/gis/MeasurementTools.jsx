import React, { useEffect, useRef, useState, useCallback } from "react";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel.js";
import { geodeticLengthExecute, geodeticLengthIsLoaded, geodeticLengthLoad, } from "@arcgis/core/geometry/operators/geodeticLengthOperator.js";
import { geodeticAreaExecute, geodeticAreaIsLoaded, geodeticAreaLoad, } from "@arcgis/core/geometry/operators/geodeticAreaOperator.js";
import { Ruler, Square, Trash2, X } from "lucide-react";
export const MeasurementTools = ({ view, isOpen, onClose, className = "", }) => {
    const [activeTool, setActiveTool] = useState(null);
    const [measurementResult, setMeasurementResult] = useState(null);
    const graphicsLayerRef = useRef(null);
    const sketchVMRef = useRef(null);
    // Initialize GraphicsLayer and SketchViewModel
    useEffect(() => {
        if (!view || !isOpen)
            return;
        // Pre-load geodetic calculation engines
        if (!geodeticLengthIsLoaded())
            void geodeticLengthLoad();
        if (!geodeticAreaIsLoaded())
            void geodeticAreaLoad();
        // Create dedicated measurement graphics layer
        const layer = new GraphicsLayer({
            id: "beacon-measurement-layer",
            title: "GIS Geodesic Measurements",
            listMode: "hide",
        });
        graphicsLayerRef.current = layer;
        view.map.add(layer);
        // Initialize headless SketchViewModel
        const sketchVM = new SketchViewModel({
            view: view,
            layer: layer,
            polylineSymbol: {
                type: "simple-line",
                color: [0, 168, 181, 1], // signal teal
                width: 3,
                style: "solid",
            },
            polygonSymbol: {
                type: "simple-fill",
                color: [0, 168, 181, 0.25],
                outline: {
                    color: [0, 168, 181, 1],
                    width: 2.5,
                },
            },
            defaultUpdateOptions: { tool: "reshape", enableRotation: false },
        });
        sketchVMRef.current = sketchVM;
        // Event listeners on sketch
        const createHandle = sketchVM.on("create", (event) => {
            if (event.state === "complete" || event.state === "active") {
                const geom = event.graphic.geometry;
                if (!geom)
                    return;
                if (geom.type === "polyline") {
                    try {
                        const length = geodeticLengthExecute(geom, { unit: "meters" });
                        setMeasurementResult({ lengthMeters: length });
                    }
                    catch (e) {
                        console.warn("Geodesic length calculation error:", e);
                    }
                }
                else if (geom.type === "polygon") {
                    try {
                        const area = Math.abs(geodeticAreaExecute(geom, { unit: "square-meters" }));
                        const perimeter = geodeticLengthExecute(geom, { unit: "meters" });
                        setMeasurementResult({
                            areaSqMeters: area,
                            perimeterMeters: perimeter,
                        });
                    }
                    catch (e) {
                        console.warn("Geodesic area calculation error:", e);
                    }
                }
            }
        });
        return () => {
            createHandle.remove();
            if (sketchVMRef.current) {
                sketchVMRef.current.cancel();
                sketchVMRef.current.destroy();
                sketchVMRef.current = null;
            }
            if (graphicsLayerRef.current && view.map) {
                view.map.remove(graphicsLayerRef.current);
                graphicsLayerRef.current.destroy();
                graphicsLayerRef.current = null;
            }
            setActiveTool(null);
            setMeasurementResult(null);
        };
    }, [view, isOpen]);
    const startMeasureDistance = useCallback(() => {
        if (!sketchVMRef.current)
            return;
        sketchVMRef.current.cancel();
        graphicsLayerRef.current?.removeAll();
        setMeasurementResult(null);
        setActiveTool("distance");
        sketchVMRef.current.create("polyline");
    }, []);
    const startMeasureArea = useCallback(() => {
        if (!sketchVMRef.current)
            return;
        sketchVMRef.current.cancel();
        graphicsLayerRef.current?.removeAll();
        setMeasurementResult(null);
        setActiveTool("area");
        sketchVMRef.current.create("polygon");
    }, []);
    const clearMeasurements = useCallback(() => {
        if (sketchVMRef.current)
            sketchVMRef.current.cancel();
        graphicsLayerRef.current?.removeAll();
        setActiveTool(null);
        setMeasurementResult(null);
    }, []);
    if (!isOpen)
        return null;
    return (<div className={`absolute bottom-20 left-4 z-30 flex flex-col gap-2 rounded-xl border border-border/80 bg-background/95 p-3 shadow-xl backdrop-blur-md select-none w-72 ${className}`} role="region" aria-label="GIS Geodesic Measurement Tools">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
          <Ruler className="h-3.5 w-3.5 text-signal"/>
          <span>Geodesic Measurement</span>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5"/>
        </button>
      </div>

      {/* Tool Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={startMeasureDistance} className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-all ${activeTool === "distance"
            ? "border-signal bg-signal text-white"
            : "border-border bg-card text-foreground hover:bg-muted"}`}>
          <Ruler className="h-3.5 w-3.5"/>
          <span>Distance</span>
        </button>

        <button type="button" onClick={startMeasureArea} className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-all ${activeTool === "area"
            ? "border-signal bg-signal text-white"
            : "border-border bg-card text-foreground hover:bg-muted"}`}>
          <Square className="h-3.5 w-3.5"/>
          <span>Area</span>
        </button>
      </div>

      {/* Measurement Readout */}
      {measurementResult && (<div className="rounded-lg border border-signal/30 bg-signal/10 p-2.5 text-xs space-y-1">
          {measurementResult.lengthMeters != null && (<div>
              <span className="text-[0.68rem] text-muted-foreground uppercase font-semibold">
                Geodesic Distance:
              </span>
              <div className="font-mono text-sm font-bold text-foreground">
                {measurementResult.lengthMeters >= 1000
                    ? `${(measurementResult.lengthMeters / 1000).toFixed(2)} km`
                    : `${Math.round(measurementResult.lengthMeters)} m`}
              </div>
            </div>)}

          {measurementResult.areaSqMeters != null && (<div>
              <span className="text-[0.68rem] text-muted-foreground uppercase font-semibold">
                Geodesic Area:
              </span>
              <div className="font-mono text-sm font-bold text-foreground">
                {measurementResult.areaSqMeters >= 1000000
                    ? `${(measurementResult.areaSqMeters / 1000000).toFixed(3)} km²`
                    : measurementResult.areaSqMeters >= 10000
                        ? `${(measurementResult.areaSqMeters / 10000).toFixed(2)} ha (${Math.round(measurementResult.areaSqMeters).toLocaleString()} m²)`
                        : `${Math.round(measurementResult.areaSqMeters).toLocaleString()} m²`}
              </div>
              {measurementResult.perimeterMeters != null && (<div className="text-[0.7rem] text-muted-foreground mt-0.5">
                  Perimeter:{" "}
                  {measurementResult.perimeterMeters >= 1000
                        ? `${(measurementResult.perimeterMeters / 1000).toFixed(2)} km`
                        : `${Math.round(measurementResult.perimeterMeters)} m`}
                </div>)}
            </div>)}
        </div>)}

      {/* Clear Button */}
      <button type="button" onClick={clearMeasurements} className="flex items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <Trash2 className="h-3 w-3"/>
        <span>Clear Measurements</span>
      </button>
    </div>);
};
