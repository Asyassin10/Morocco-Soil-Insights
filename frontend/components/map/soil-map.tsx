"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as GLMap, Marker, GeoJSONSource } from "mapbox-gl";
import type { FeatureCollection, Feature, Position } from "geojson";
import { KeyRound, MapPin, Minus, Plus, Compass, Layers, LocateFixed, MoveUpRight } from "lucide-react";
import { patch, useAppDispatch, useAppSelector } from "@/store";
import type { Geometry, SoilValue } from "@/lib/types";
import { getLayer } from "@/lib/layer-cache";
import { layerPalette } from "@/lib/layers";
import { compareProperty } from "@/lib/comparison";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function SoilMap({ token, active, range, onFieldClick, comparisonOpen, comparisonWide, previewOpen, focusRequest }: { token: string; active?: SoilValue; range: [number, number]; onFieldClick?: () => void; comparisonOpen: boolean; comparisonWide:boolean; previewOpen: boolean; focusRequest: {target:"a"|"b"|"both";id:number} | null }) {
  const dispatch = useAppDispatch();
  const state = useAppSelector(s => s.field);
  const live = useRef(state);
  live.current = state;
  const fieldClick = useRef(onFieldClick); fieldClick.current = onFieldClick;
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [overlayError, setOverlayError] = useState("");
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [pitched, setPitched] = useState(false);

  useEffect(() => {
    if (!token || !host.current) return;
    let disposed = false;
    let instance: GLMap | null = null;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (disposed || !host.current) return;
      mapboxgl.accessToken = token;
      instance = new mapboxgl.Map({ container: host.current, style: "mapbox://styles/mapbox/satellite-v9", center: [-7.8, 30.5], zoom: 5.2,
        attributionControl: true, preserveDrawingBuffer: false, fadeDuration: 150 });
      map.current = instance;
      instance.on("load", () => {
        if (!instance || disposed) return;
        for (const id of ["field", "draft-line", "soil", "comparison-field", "comparison-soil"]) instance.addSource(id, { type: "geojson", data: EMPTY });
        instance.addLayer({ id: "comparison-fill", type: "fill", source: "comparison-field", paint: { "fill-color": "#E99532", "fill-opacity": .1 } });
        instance.addLayer({ id: "comparison-soil-fill", type: "fill", source: "comparison-soil", paint: { "fill-color": "#F49B37", "fill-opacity": .82 } });
        instance.addLayer({ id: "comparison-outline", type: "line", source: "comparison-field", paint: { "line-color": "#FFB74A", "line-width": 3, "line-dasharray": [3,2] } });
        instance.addLayer({ id: "soil-fill", type: "fill", source: "soil", paint: { "fill-color": "#F49B37", "fill-opacity": .82 } });
        instance.addLayer({ id: "field-fill", type: "fill", source: "field", paint: { "fill-color": "#B4CB87", "fill-opacity": .13 } });
        instance.addLayer({ id: "field-outline", type: "line", source: "field", paint: { "line-color": "#E8F3CF", "line-width": 2 } });
        instance.addLayer({ id: "draw-line", type: "line", source: "draft-line", paint: { "line-color": "#DCECAE", "line-width": 2, "line-dasharray": [3, 2] } });
        setReady(true); dispatch(patch({ mapReady: true }));
        if (!live.current.field) instance.fitBounds([[-17.2,20.8],[-.9,35.9]], { padding: 40, duration: 0 });
      });
      instance.on("click", (event) => {
        if (live.current.confirmed && !live.current.editing && instance?.queryRenderedFeatures?.(event.point, { layers: ["field-fill"] }).length) {
          fieldClick.current?.(); return;
        }
        if (!live.current.drawing) return;
        const point: [number, number] = [Number(event.lngLat.lng.toFixed(7)), Number(event.lngLat.lat.toFixed(7))];
        if (live.current.vertices.some(p => p[0] === point[0] && p[1] === point[1])) return;
        const vertices = [...live.current.vertices, point];
        const draft: Geometry | null = vertices.length >= 3 ? { type: "Polygon", coordinates: [[...vertices, vertices[0]]] } : null;
        dispatch(patch({ vertices, draft, field: null, error: null, confirmed: false }));
      });
      instance.on("error", (event) => {
        if (!live.current.mapReady) setMapError(event.error?.message || "Mapbox could not load. Check your public token and network connection.");
      });
    }).catch(() => setMapError("The map could not initialize. Check your browser's WebGL support."));
    return () => { disposed = true; instance?.remove(); map.current = null; };
  }, [token, dispatch]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("field") as GeoJSONSource).setData(state.draft ? { type: "Feature", properties: {}, geometry: state.draft } : EMPTY);
    (m.getSource("draft-line") as GeoJSONSource).setData(state.drawing && state.vertices.length >= 2
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: state.vertices } } : EMPTY);
    m.getCanvas().style.cursor = state.drawing ? "crosshair" : "";
    if (state.drawing) m.doubleClickZoom.disable(); else m.doubleClickZoom.enable();
    m.setPaintProperty("field-outline", "line-color", state.confirmed ? "#E8F3CF" : "#D9ECA9");
  }, [ready, state.draft, state.vertices, state.drawing, state.confirmed]);

  function fitFields(which: "a" | "b" | "both" = "both") {
    const fields = [which !== "b" ? state.comparison?.field : null, which !== "a" ? state.field : null].filter(Boolean);
    if(!map.current || !fields.length)return;
    const w=Math.min(...fields.map(f=>f!.bounds[0])), s=Math.min(...fields.map(f=>f!.bounds[1]));
    const e=Math.max(...fields.map(f=>f!.bounds[2])), n=Math.max(...fields.map(f=>f!.bounds[3]));
    const mobile=matchMedia("(max-width:760px)").matches;
    const width=host.current?.clientWidth || 1000;
    const left=!mobile && previewOpen ? Math.min(455,width*.48) : 65;
    const right=!mobile && comparisonOpen && state.comparison ? Math.min(comparisonWide ? 720 : 460,width*.68) : 65;
    map.current.fitBounds([[w,s],[e,n]],{padding:mobile ? {left:45,right:45,top:130,bottom:65} : {left,right,top:155,bottom:85},duration:matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,maxZoom:17});
  }
  useEffect(() => {
    if(!ready || !map.current)return;
    (map.current.getSource("comparison-field") as GeoJSONSource).setData(state.comparison ? {type:"Feature",properties:{},geometry:state.comparison.field.geometry} : EMPTY);
    fitFields(state.comparison && comparisonOpen ? "both" : state.field ? "b" : "a");
    // UI layout changes also reframe the field into the uncovered portion of the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.field, state.comparison, comparisonOpen, comparisonWide, previewOpen]);

  useEffect(()=>{
    if(ready && focusRequest)fitFields(focusRequest.target);
    // Requests explicitly reframe even if the same land is selected twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ready,focusRequest]);

  useEffect(()=>{
    const m=map.current;
    if(!ready || !m)return;
    const abort=new AbortController();
    (m.getSource("comparison-soil") as GeoJSONSource).setData(EMPTY);
    const values=state.comparison ? [...state.comparison.analysis.values,...(state.comparison.terrain?.values || [])] : [];
    const pair=state.comparison && state.confirmed && state.analysis && state.field ? compareProperty(state.comparison,{name:state.filename,field:state.field,analysis:state.analysis,terrain:state.terrain},state.activeLayer) : null;
    const value=pair?.a || values.find(v=>v.property===state.activeLayer && v.source===state.comparison?.analysis.preferred[state.activeLayer]) || values.find(v=>v.property===state.activeLayer && v.status==="ok");
    if(!value?.layer_url || value.status!=="ok")return;
    getLayer(value.layer_url,abort.signal).then(data=>{
      if(abort.signal.aborted)return;
      (m.getSource("comparison-soil") as GeoJSONSource).setData(data);
      const palette=layerPalette(value.property);
      m.setPaintProperty("comparison-soil-fill","fill-color",["interpolate",["linear"],["get","value"],range[0],palette[0],(range[0]+range[1])/2,palette[1],range[1],palette[2]]);
    }).catch(()=>{});
    return()=>abort.abort();
  },[ready,state.comparison,state.analysis,state.terrain,state.field,state.filename,state.confirmed,state.activeLayer,range[0],range[1]]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    markers.current.forEach(marker => marker.remove()); markers.current = [];
    let disposed = false;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (disposed) return;
      const points: { point: Position; polygon: number; ring: number; vertex: number }[] = [];
      if (state.drawing) state.vertices.forEach((point, vertex) => points.push({ point, polygon: 0, ring: 0, vertex }));
      else if (state.editing && state.draft) {
        const polygons = state.draft.type === "Polygon" ? [state.draft.coordinates] : state.draft.coordinates;
        polygons.forEach((polygon, p) => polygon.forEach((ring, r) => ring.slice(0, -1).forEach((point, vertex) => points.push({ point, polygon: p, ring: r, vertex }))));
      }
      points.forEach(({ point, polygon, ring, vertex }) => {
        const element = document.createElement("div"); element.className = "field-vertex"; element.textContent = String(vertex + 1);
        element.setAttribute("aria-label", `Vertex ${vertex + 1}`);
        const marker = new mapboxgl.Marker({ element, draggable: state.editing }).setLngLat([point[0], point[1]]).addTo(m);
        marker.on("dragend", () => {
          const geometry = live.current.draft;
          if (!geometry) return;
          const next = structuredClone(geometry);
          const rings = next.type === "Polygon" ? next.coordinates : next.coordinates[polygon];
          const pos = marker.getLngLat();
          rings[ring][vertex] = [pos.lng, pos.lat];
          if (vertex === 0) rings[ring][rings[ring].length - 1] = [pos.lng, pos.lat];
          dispatch(patch({ draft: next, field: null, confirmed: false, analysis: null, terrain: null, status: "idle", error: null }));
        });
        markers.current.push(marker);
      });
    });
    return () => { disposed = true; markers.current.forEach(marker => marker.remove()); markers.current = []; };
  }, [ready, state.editing, state.drawing, state.vertices, state.draft, dispatch]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const controller = new AbortController();
    (m.getSource("soil") as GeoJSONSource).setData(EMPTY);
    setOverlayError(""); setOverlayLoading(false);
    if (!state.confirmed || !active?.layer_url || active.status !== "ok") return;
    const url = active.layer_url;
    setOverlayLoading(true);
    const promise = getLayer(url, controller.signal);
    promise.then(data => {
      if (controller.signal.aborted) return;
      (m.getSource("soil") as GeoJSONSource).setData(data);
      const palette=layerPalette(active.property);
      m.setPaintProperty("soil-fill", "fill-color", ["interpolate", ["linear"], ["get", "value"], range[0], palette[0], (range[0]+range[1])/2, palette[1], range[1], palette[2]]);
    }).catch(() => { if (!controller.signal.aborted) setOverlayError("This layer could not load. Select another source or retry analysis."); })
      .finally(() => { if (!controller.signal.aborted) setOverlayLoading(false); });
    return () => controller.abort();
  }, [ready, active?.layer_url, active?.property, active?.status, range[0], range[1], state.confirmed]);

  return <section className={`map-region ${!token ? "map-unconfigured" : ""} ${previewOpen ? "map-preview-open" : ""}`} aria-label="Field map">
    <div ref={host} className="map-canvas" data-testid="map-canvas" />
    {!token && <>
      <svg className="contour-art" viewBox="0 0 1000 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 80 0 L 0 0 0 80" fill="none" stroke="#9CB18C" strokeOpacity=".16" /></pattern></defs>
        <rect width="1000" height="900" fill="url(#grid)" />
        {Array.from({ length: 17 }, (_, i) => <path key={i} d={`M ${-300+i*28} 950 C ${100+i*20} ${760-i*10}, ${710-i*15} ${820-i*25}, ${720+i*22} ${390-i*24} S ${720+i*15} ${100-i*20}, ${1180+i*20} ${-200+i*10}`} fill="none" stroke={i%4===0 ? "#8DA477" : "#B6C5A5"} strokeWidth={i%4===0 ? 1.5 : 1} opacity=".45" />)}
        <circle cx="660" cy="380" r="180" fill="none" stroke="#A6B797" strokeDasharray="4 10" opacity=".4" />
      </svg>
      <div className="setup-card">
        <div className="setup-symbol"><MapPin size={27} strokeWidth={1.4} /></div>
        <span className="eyebrow">YOUR EXPLORATION STARTS HERE</span>
        <h2>A clearer view.<br /><em>From the ground up.</em></h2>
        <p>Satellite imagery and soil layers, brought together for your field in Morocco.</p>
        <div className="token-notice"><KeyRound size={17} /><div><strong>Add your Mapbox token to explore</strong><span>Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in<br /><code>frontend/.env.local</code>, then restart Next.js.</span></div></div>
        <span className="setup-footnote">You can upload and validate a field while you set up.</span>
      </div>
      <span className="cartographic-label label-north">MOROCCO<span>31° 48′ N / 6° 54′ W</span></span>
    </>}
    {mapError && <div className="map-alert" role="alert">{mapError}</div>}
    {state.drawing && <div className="drawing-hint"><span className="live-dot" />Click to place boundary points<span>{state.vertices.length} placed</span></div>}
    {state.editing && <div className="drawing-hint">Drag the numbered vertices, then confirm the field.</div>}
    <div className="map-tools">
      <button aria-label="Open map 3D layers" title="Soil layers in 3D" disabled={!state.confirmed} onClick={()=>fieldClick.current?.()}><Layers size={19}/></button>
      <button aria-label="Fit selected fields" title="Fit selected fields" disabled={!ready || (!state.field && !state.comparison)} onClick={()=>fitFields(state.comparison && comparisonOpen ? "both" : "b")}><LocateFixed size={19}/></button>
      <button aria-label="Tilt map" aria-pressed={pitched} title="Tilt map" disabled={!ready} onClick={()=>{const next=!pitched;setPitched(next);map.current?.easeTo({pitch:next ? 50 : 0,duration:matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500});}}><MoveUpRight size={19}/></button>
      <button aria-label="Zoom in" disabled={!ready} onClick={() => map.current?.zoomIn()}><Plus size={19} /></button>
      <button aria-label="Zoom out" disabled={!ready} onClick={() => map.current?.zoomOut()}><Minus size={19} /></button>
      <button aria-label="Reset north" disabled={!ready} onClick={() => map.current?.resetNorth()}><Compass size={19} /></button>
    </div>
    {state.confirmed && active?.status==="ok" && <div className="map-legend"><div><Layers size={14} /><strong>{active.label}</strong></div><div className="legend-gradient" style={{background:`linear-gradient(to right,${layerPalette(active.property).join(",")})`}}/><footer><span>{range[0]} {active.unit}</span><span>{range[1]} {active.unit}</span></footer><small>Low → high · not a suitability rating</small>{overlayLoading && <small>Loading layer…</small>}</div>}
    {overlayError && <div className="overlay-error" role="alert">{overlayError}</div>}
  </section>;
}
