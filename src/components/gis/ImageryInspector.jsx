import React, { useState, useEffect } from "react";
import { Satellite, Calendar, AlertTriangle, CheckCircle, Copy, Check, RefreshCw, Search, ShieldCheck, X, Gauge, Building, } from "lucide-react";
import { queryImageryCitation, } from "@/lib/gis/citation-service";
import { calculateGroundResolutionMpp, formatResolution, formatScaleRatio, evaluateOverzoom, } from "@/lib/gis/resolution-utils";
export const ImageryInspector = ({ isOpen, onClose, activePoint, currentZoom, currentScale = 0, onInspectCenter, onSnapToNativeLimit, className = "", }) => {
    const [citation, setCitation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    // Fetch citation when activePoint changes
    useEffect(() => {
        if (!isOpen || !activePoint)
            return;
        let isMounted = true;
        setLoading(true);
        queryImageryCitation(activePoint.latitude, activePoint.longitude)
            .then((record) => {
            if (!isMounted)
                return;
            setCitation(record);
        })
            .catch(() => {
            if (!isMounted)
                return;
            setCitation(null);
        })
            .finally(() => {
            if (isMounted)
                setLoading(false);
        });
        return () => {
            isMounted = false;
        };
    }, [isOpen, activePoint?.latitude, activePoint?.longitude]);
    if (!isOpen)
        return null;
    const lat = activePoint?.latitude || 0;
    const lng = activePoint?.longitude || 0;
    // Resolution and overzoom calculations
    const displayGsdMpp = calculateGroundResolutionMpp(lat, currentZoom);
    const displayGsdFormatted = formatResolution(displayGsdMpp);
    const scaleFormatted = formatScaleRatio(currentScale);
    const maxNativeLOD = citation?.maxMapLevel || 19;
    const overzoomDiag = evaluateOverzoom(currentZoom, maxNativeLOD);
    const handleCopySummary = async () => {
        const summary = {
            coordinates: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            zoom: currentZoom,
            scale: scaleFormatted,
            displayGSD: displayGsdFormatted.summary,
            provider: citation?.provider || "Unavailable",
            sourceName: citation?.sourceName || "Unavailable",
            acquisitionDate: citation?.acquisitionDate || "Unavailable",
            nativeResolution: citation?.nativeResolutionFormatted || "Unavailable",
            overzoom: overzoomDiag.isOverzoomed ? `${overzoomDiag.overzoomFactor}x Resampled` : "Native",
        };
        try {
            await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            // Ignore
        }
    };
    return (<aside className={`absolute right-4 top-16 z-30 w-80 max-w-[calc(100%-2rem)] rounded-xl border border-border/80 bg-background/95 p-4 shadow-xl backdrop-blur-md select-none ${className}`} aria-label="Imagery Resolution & Citation Inspector">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-signal"/>
          <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
            Imagery Intelligence
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={handleCopySummary} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Copy Inspection Details as JSON">
            {copied ? <Check className="h-3.5 w-3.5 text-safe"/> : <Copy className="h-3.5 w-3.5"/>}
          </button>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Close Inspector">
            <X className="h-4 w-4"/>
          </button>
        </div>
      </div>

      {/* Action to refresh / query center */}
      {onInspectCenter && (<div className="pt-3">
          <button type="button" onClick={onInspectCenter} disabled={loading} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-signal/15 px-3 py-1.5 text-xs font-semibold text-signal hover:bg-signal/20 transition-colors">
            {loading ? (<RefreshCw className="h-3.5 w-3.5 animate-spin"/>) : (<Search className="h-3.5 w-3.5"/>)}
            <span>{loading ? "Querying Layer 4 Citations..." : "Inspect Viewport Center"}</span>
          </button>
        </div>)}

      {/* Inspection Details Body */}
      <div className="mt-3 space-y-3 text-xs">
        {/* Optical Sensor & Provider */}
        <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Source Provider
            </span>
            <Building className="h-3.5 w-3.5 text-signal"/>
          </div>
          <div className="font-semibold text-foreground text-xs truncate">
            {citation?.provider || (loading ? "Querying..." : "Esri World Imagery")}
          </div>
          <div className="text-[0.7rem] text-muted-foreground truncate">
            {citation?.sourceName || "Maxar / Earthstar Geographics"}
          </div>
        </div>

        {/* Acquisition & Native GSD */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-card p-2 space-y-1">
            <div className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
              <Calendar className="h-3 w-3 text-signal"/>
              <span>Acquisition</span>
            </div>
            <div className="font-mono text-xs font-semibold text-foreground">
              {citation?.acquisitionDate || "Unavailable"}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-2 space-y-1">
            <div className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
              <Gauge className="h-3 w-3 text-signal"/>
              <span>Native GSD</span>
            </div>
            <div className="font-mono text-xs font-semibold text-foreground">
              {citation?.nativeResolutionFormatted || "0.34 m/px"}
            </div>
          </div>
        </div>

        {/* Display GSD vs Native Comparison */}
        <div className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Display GSD (Current LOD)
            </span>
            <span className="font-mono text-[0.68rem] text-signal font-semibold">
              LOD {currentZoom.toFixed(1)}
            </span>
          </div>
          <div className="font-mono text-sm font-bold text-foreground">
            {displayGsdFormatted.summary}
          </div>
          <div className="text-[0.68rem] text-muted-foreground">
            Scale {scaleFormatted}
          </div>
        </div>

        {/* Overzoom Diagnostic Alert */}
        {overzoomDiag.isOverzoomed ? (<div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5"/>
              <div className="space-y-1">
                <span className="font-semibold text-amber-500 text-[0.72rem]">
                  Digitally Resampled ({overzoomDiag.overzoomFactor}x Overzoom)
                </span>
                <p className="text-[0.68rem] leading-relaxed text-foreground">
                  Native optical limit is LOD {maxNativeLOD}. Further zooming enlarges pixels without adding sensor detail.
                </p>
                {onSnapToNativeLimit && (<button type="button" onClick={onSnapToNativeLimit} className="mt-1 flex items-center gap-1 text-[0.68rem] font-semibold text-signal hover:underline">
                    <ShieldCheck className="h-3 w-3"/>
                    <span>Snap to optical limit (LOD {maxNativeLOD})</span>
                  </button>)}
              </div>
            </div>
          </div>) : (<div className="flex items-center gap-2 rounded-lg border border-safe/30 bg-safe/10 p-2 text-xs text-foreground">
            <CheckCircle className="h-3.5 w-3.5 text-safe shrink-0"/>
            <span className="text-[0.7rem] font-medium">
              Native optical resolution active (LOD {currentZoom.toFixed(1)} ≤ {maxNativeLOD})
            </span>
          </div>)}
      </div>
    </aside>);
};
