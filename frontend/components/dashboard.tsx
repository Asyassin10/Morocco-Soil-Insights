"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleHelp, FileJson2, Info, Layers3, LoaderCircle, MapPinned, Mountain, Pencil, RotateCcw, Sprout, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { patch, reset, startDrawing, useAppDispatch, useAppSelector } from "@/store";
import { analyze, catalog, readFile, terrain, validate } from "@/lib/api";
import { LAYERS, STACK_KEYS } from "@/lib/layers";
import { getLayer } from "@/lib/layer-cache";
import { AnalysisProgress, applyProgress, initialProgress, type ProgressState } from "./analysis-progress";
import { LandComparison } from "./land-comparison";
import { FieldDock } from "./field-dock";
import { compareProperty } from "@/lib/comparison";
import type { Analysis, Catalog, Geometry, SoilValue, SavedLand } from "@/lib/types";

const SoilMap = dynamic(() => import("./map/soil-map").then(m => m.SoilMap), { ssr: false, loading: () => <div className="map-region map-skeleton" /> });
const TerrainPreview = dynamic(() => import("./terrain-preview"), { ssr: false });
const FieldStack = dynamic(() => import("./field-stack"), { ssr: false, loading: () => <div className="stack-loading"><LoaderCircle className="spin" />Opening layers…</div> });
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || "";
const requestCache = new Map<string, Analysis>();
const OVERVIEW = ["ph", "organic_carbon", "nitrogen", "clay", "sand", "silt", "bulk_density", "cec", "stones", "bedrock_depth", "carbon_stock"];
const NUTRIENTS = ["phosphorus", "potassium", "calcium", "magnesium", "iron", "zinc"];
const WATER = ["water_retention_33", "water_retention_1500", "elevation", "slope", "aspect"];
const pretty = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);

export function Dashboard() {
  const state = useAppSelector(s => s.field);
  const dispatch = useAppDispatch();
  const [hydrated,setHydrated]=useState(false);
  const [dataCatalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState("overview");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<"layers" | "terrain">("layers");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareMode,setCompareMode]=useState<"readings"|"3d">("readings");
  const [focusRequest,setFocusRequest]=useState<{target:"a"|"b"|"both";id:number}|null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    document.dispatchEvent(new Event("msi:hydrated"));
    setHydrated(true);
    const abort = new AbortController();
    catalog(abort.signal).then(setCatalog).catch(() => {});
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);

  const currentLand: SavedLand | null = state.confirmed && state.analysis && state.field ? {name:state.filename || "Selected field",field:state.field,analysis:state.analysis,terrain:state.terrain} : null;
  const allValues = [...(state.analysis?.values || []), ...(state.terrain?.values || [])];
  function chooseValue(property: string, selected = state.source): SoilValue | undefined {
    if(selected==="Auto" && state.comparison && currentLand)return compareProperty(state.comparison,currentLand,property).b;
    const values = allValues.filter(v => v.property === property);
    const desired = selected === "Auto" ? state.analysis?.preferred[property] || (values.some(v => v.source === "iSDAsoil") ? "iSDAsoil" : values[0]?.source) : selected;
    return values.find(v => v.source === desired);
  }
  const active = chooseValue(state.activeLayer);
  const selectedCatalog = dataCatalog?.properties.find(p => p.id === state.activeLayer);
  const range: [number, number] = state.activeLayer === "elevation" ? [active?.min ?? 0, Math.max((active?.min ?? 0)+1, active?.max ?? 1000)]
    : state.activeLayer === "slope" ? [0, 30] : state.activeLayer === "aspect" ? [0, 360] : selectedCatalog?.range || [0, 100];

  function invalidateRequests() {
    generation.current++; controller.current?.abort();
    setPreview(false); setProgress(null);
  }
  function draw() { invalidateRequests(); dispatch(startDrawing()); }
  function clear() { invalidateRequests(); dispatch(reset()); }
  function edit() {
    invalidateRequests(); dispatch(patch({ editing: true, drawing: false, confirmed: false, analysis: null, terrain: null, status: "idle", error: null }));
  }
  function undo() {
    const vertices = state.vertices.slice(0, -1);
    const draft: Geometry | null = vertices.length >= 3 ? { type: "Polygon", coordinates: [[...vertices, vertices[0]]] } : null;
    dispatch(patch({ vertices, draft, field: null, error: null }));
  }

  async function upload(file?: File) {
    if (!file) return;
    invalidateRequests(); const id = generation.current;
    const abort = new AbortController(); controller.current = abort;
    dispatch(patch({ status: "validating", error: null, confirmed: false, analysis: null, terrain: null, drawing: false, editing: false, draft: null, field: null, vertices: [], filename: file.name }));
    try {
      const parsed = await readFile(file);
      const field = await validate(parsed, abort.signal);
      if (id !== generation.current) return;
      dispatch(patch({ field, draft: field.geometry, status: "idle" }));
    } catch (error) {
      if (id === generation.current && !abort.signal.aborted) dispatch(patch({ status: "error", error: error instanceof Error ? error.message : "The file could not be read." }));
    } finally { if (fileInput.current) fileInput.current.value = ""; }
  }

  async function confirm(force = false) {
    if (!state.draft || !state.mapReady) return;
    invalidateRequests(); const id = generation.current;
    const abort = new AbortController(); controller.current = abort;
    setProgress(initialProgress());
    dispatch(patch({ status: "validating", error: null, analysis: null, terrain: null }));
    try {
      const field = await validate(state.draft, abort.signal);
      if (id !== generation.current) return;
      setProgress(p=>p && ({...p,boundary:"ok",terrain:"working"}));
      dispatch(patch({ field, draft: field.geometry, confirmed: true, drawing: false, editing: false, status: "loading", source: "Auto" }));
      const key = JSON.stringify(field.geometry);
      if (force) requestCache.delete(key);
      const soilRequest = requestCache.has(key) ? Promise.resolve(requestCache.get(key)!) : analyze(field.geometry, abort.signal, undefined, event=>{
        if(id===generation.current && !abort.signal.aborted) setProgress(p=>p && applyProgress(p,event));
      });
      const results = await Promise.allSettled([
        soilRequest.then(async result => {
          if (id !== generation.current || abort.signal.aborted) return;
          requestCache.set(key, result); dispatch(patch({ analysis: result }));
          // JSON/cached responses also complete their real returned property tasks.
          setProgress(p=>p && ({...p,planned:true,layers:"working",tasks:Object.fromEntries(result.values.map(v=>[`${v.source}|${v.property}`,{property:v.property,status:v.status==="ok" ? "ok" : "unavailable"}]))}));
          const layerValues=STACK_KEYS.map(property=>result.values.find(v=>v.property===property && v.source===(result.preferred[property] || "iSDAsoil")));
          const prepared=await Promise.allSettled(layerValues.filter(v=>v?.status==="ok" && v.layer_url).map(v=>getLayer(v!.layer_url!,abort.signal)));
          if(id===generation.current && !abort.signal.aborted) setProgress(p=>p && ({...p,layers:prepared.length===5 && prepared.every(r=>r.status==="fulfilled") ? "ok" : "partial"}));
        }),
        terrain(field.geometry, abort.signal).then(result => {
          if (id === generation.current && !abort.signal.aborted) { dispatch(patch({ terrain: result })); setProgress(p=>p && ({...p,terrain:result.mesh ? "ok" : "unavailable"})); }
        }).catch(error=>{if(id===generation.current && !abort.signal.aborted) setProgress(p=>p && ({...p,terrain:"unavailable"}));throw error;}),
      ]);
      if (id !== generation.current) return;
      const failure = results[0].status === "rejected" ? results[0].reason : null;
      dispatch(patch({ status: failure ? "error" : "ready", error: failure instanceof Error ? failure.message : null }));
      setProgress(null);
      if(!failure){setPreviewMode("layers");setPreview(!state.comparison);if(state.comparison)setCompareOpen(true);}
    } catch (error) {
      if (id === generation.current && !abort.signal.aborted) { setProgress(null); dispatch(patch({ status: "error", error: error instanceof Error ? error.message : "This field could not be analyzed." })); }
    }
  }

  const busy = state.status === "loading" || state.status === "validating";
  const keys = tab === "nutrients" ? NUTRIENTS : tab === "water" ? WATER : OVERVIEW;
  const stackValues = STACK_KEYS.map(key => chooseValue(key)).filter((value): value is SoilValue => Boolean(value));
  const selectLayer = (key: string) => { dispatch(patch({ activeLayer: key, source: "Auto" })); setTab(WATER.includes(key) ? "water" : NUTRIENTS.includes(key) ? "nutrients" : "overview"); };
  function addComparisonLand(mode:"draw"|"upload") {
    if(!state.comparison && !currentLand)return;
    invalidateRequests();
    if(!state.comparison)dispatch(patch({comparison:currentLand}));
    dispatch(reset());
    setCompareOpen(false);
    if(mode==="draw")dispatch(startDrawing());else fileInput.current?.click();
  }
  function openComparison(mode:"readings"|"3d"){setPreview(false);setCompareMode(mode);setCompareOpen(true);}
  function removeComparison(){
    if(state.comparison && !currentLand){
      const saved=state.comparison;
      invalidateRequests();
      dispatch(patch({comparison:null,field:saved.field,draft:saved.field.geometry,filename:saved.name,analysis:saved.analysis,terrain:saved.terrain,confirmed:true,drawing:false,editing:false,status:"ready",error:null}));
    }else dispatch(patch({comparison:null}));
    setCompareOpen(false);
  }
  const openHelp = () => modal.current?.showModal();
  const activeInfo = LAYERS[state.activeLayer];
  const ActiveIcon = activeInfo?.icon || Layers3;

  return <main className="workspace clean-workspace">
    <nav className="rail" aria-label="Main navigation">
      <a href="/" className="rail-brand" aria-label="Morocco Soil Insights home"><Sprout size={25} strokeWidth={1.5} /></a>
      <button className="rail-item active" aria-label="Explore fields" onClick={() => { setPreview(false);setCompareOpen(false); modal.current?.close(); }}><MapPinned size={21} /></button>
      <button className="rail-item" aria-label="Open 3D layers" disabled={!state.analysis} onClick={() => {setCompareOpen(false); setPreviewMode("layers"); setPreview(true); }}><Layers3 size={21} /></button>
      <span className="rail-spacer" />
      <div className="rail-country">MA</div>
    </nav>
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="Morocco Soil Insights home"><strong>Morocco<span> Soil Insights</span></strong></a>
    </header>
    <aside className="sidebar" aria-label="Field analysis">
      <div className="sidebar-heading"><div className="intro"><h1>Your field.<br /><span>Layer by layer.</span></h1></div><button className="sidebar-help" aria-label="Help" disabled={!hydrated} onClick={openHelp}><CircleHelp size={17}/><span>Help</span></button></div>
      <div className="field-actions"><Button variant="outline" onClick={draw} disabled={!state.mapReady}><Pencil size={16} />Draw Field</Button><Button variant="outline" onClick={() => fileInput.current?.click()}><Upload size={16} />Upload GeoJSON</Button></div>
      <input ref={fileInput} type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" aria-label="Upload GeoJSON file" data-testid="file-input" onChange={event => upload(event.target.files?.[0])} />
      {!state.draft && !state.drawing && <div className={`upload-zone ${dragging ? "dragging" : ""}`} role="button" tabIndex={0} aria-label="Drop or browse a GeoJSON file" data-testid="dropzone"
        onClick={() => fileInput.current?.click()} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.current?.click(); } }}
        onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files[0]); }}>
        <FileJson2 size={22} strokeWidth={1.4} /><span>Drop your GeoJSON here</span><small>or browse · up to 5 MB</small>
      </div>}
      {state.drawing && <div className="drawing-panel"><strong><span className="live-dot" />Drawing field boundary</strong><div><Badge>{state.vertices.length} points</Badge><Button variant="ghost" size="sm" disabled={!state.vertices.length} onClick={undo}><RotateCcw size={13} />Undo Point</Button><Button variant="ghost" size="sm" onClick={clear}>Cancel</Button></div></div>}
      {state.draft && <div className="field-summary"><MapPinned size={19} /><div><strong title={state.filename}>{state.filename || "Selected field"}</strong><span>{state.field ? `${pretty(state.field.area_ha)} hectares` : "Boundary awaiting validation"}{state.confirmed ? "" : " · Preview"}</span></div><Button variant="ghost" size="icon" aria-label="Clear field" onClick={clear}><X size={14} /></Button></div>}
      {(state.draft || state.drawing) && !state.confirmed && <div className="confirm-row"><Button onClick={() => confirm()} disabled={!state.draft || !state.mapReady || busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Confirm Field<ArrowRight size={15} /></Button>{!state.drawing && <Button variant="ghost" size="sm" disabled={!state.mapReady} onClick={edit}><Pencil size={14} />Edit</Button>}<Button variant="ghost" size="sm" onClick={clear} aria-label="Cancel field preview"><X size={16} /></Button></div>}
      {state.draft && !token && <p className="inline-note">Add your Mapbox token to preview and confirm.</p>}
      {state.confirmed && <div className="edit-actions"><Button variant="ghost" size="sm" onClick={edit}><Pencil size={13} />Edit boundary</Button><Button variant="ghost" size="sm" onClick={draw}><RotateCcw size={13} />Redraw</Button></div>}
      {state.error && <div className="error-note" role="alert"><Info size={16} /><span>{state.error}</span><button aria-label="Dismiss error" onClick={() => dispatch(patch({ error: null }))}><X size={14} /></button></div>}
      {busy && !progress && <div className="loading-note" role="status"><LoaderCircle className="spin" size={15} /><span>Checking boundary…</span></div>}
      <div className="section-divider" />
      <div className="tabs" role="tablist" aria-label="Analysis category">{[["overview","Soil"],["nutrients","Nutrients"],["water","Water & terrain"]].map(([id,label]) => <button key={id} role="tab" aria-selected={tab===id} aria-controls="insights-panel" onClick={() => setTab(id)}>{label}</button>)}</div>
      <div id="insights-panel" role="tabpanel" className="insights-panel">
        <div className="layer-grid">{keys.map(key => {
          const value = chooseValue(key);
          const available = value?.status === "ok" && value.value !== null;
          const item = LAYERS[key]; const Icon = item?.icon || Layers3;
          return <button className={`layer-tile ${state.activeLayer===key ? "selected" : ""}`} key={key} onClick={() => selectLayer(key)} aria-pressed={state.activeLayer===key} title={item?.description}>
            <span className="layer-tile-icon" style={{ color: item?.color }}><Icon size={21} strokeWidth={1.6} /></span>
            <strong>{item?.label || key}</strong><span className="layer-tile-value">{available ? pretty(value.value!) : "—"}<small>{available ? value.unit : ""}</small></span>
          </button>;
        })}</div>
        {state.confirmed && active && <div className="selected-reading" key={state.activeLayer}>
          <div><ActiveIcon size={19} /><strong>{activeInfo?.label || active.label}</strong></div>
          <p>{activeInfo?.description}</p>
          <span>{active.source} · {active.depth}</span>
          {active.status!=="ok" && <p>No data available for this field.</p>}
        </div>}
      </div>
      {state.analysis && <button className="open-stack" onClick={() => {setCompareOpen(false); setPreviewMode("layers"); setPreview(true); }}><Layers3 size={20} /><span>View field in 3D</span><ArrowRight size={16} /></button>}
    </aside>
    <SoilMap token={token} active={active} range={range} focusRequest={focusRequest} comparisonOpen={compareOpen} comparisonWide={compareMode==="3d"} previewOpen={preview} onFieldClick={() => { setCompareOpen(false);setPreviewMode("layers"); setPreview(true); }} />
    {(state.comparison || currentLand) && <FieldDock first={(state.comparison || currentLand)!} second={state.comparison && currentLand && JSON.stringify(state.comparison.field.geometry)!==JSON.stringify(currentLand.field.geometry) ? currentLand : null} pending={Boolean(state.comparison)} busy={busy} onAdd={addComparisonLand} onCompare={()=>openComparison("readings")} on3D={()=>openComparison("3d")} onFocus={target=>setFocusRequest(previous=>({target,id:(previous?.id || 0)+1}))} onCancel={removeComparison}/>}
    {progress && <AnalysisProgress progress={progress} onCancel={()=>{invalidateRequests();dispatch(patch({status:"idle",confirmed:false,analysis:null,terrain:null,error:null}));}}/>}
    {preview && state.confirmed && <section className="field-view floating-field-view" aria-label="3D field explorer">
      <div className="field-view-header"><div><h2>{previewMode==="layers" ? "Your soil in 3D" : "Your terrain"}</h2><span>{state.field ? `${pretty(state.field.area_ha)} ha` : ""} · Hover to explore</span></div><button aria-label="Close 3D view" className="close-view" onClick={() => setPreview(false)}><X size={18} /></button></div>
      <div className="view-switch"><button aria-pressed={previewMode==="layers"} onClick={() => setPreviewMode("layers")}><Layers3 size={15} />Soil layers</button><button aria-pressed={previewMode==="terrain"} onClick={() => setPreviewMode("terrain")}><Mountain size={15} />Terrain</button></div>
      {previewMode==="layers" && state.field && <FieldStack field={state.field} values={stackValues} ranges={dataCatalog?.properties || []} activeKey={state.activeLayer} onSelect={selectLayer} />}
      {previewMode==="terrain" && (state.terrain?.mesh ? <TerrainPreview mesh={state.terrain.mesh} /> : <div className="terrain-empty"><Mountain size={36} /><p>{busy ? "Loading terrain…" : "Terrain unavailable for this field."}</p></div>)}
    </section>}
    {compareOpen && state.comparison && <LandComparison first={state.comparison} second={currentLand} ranges={dataCatalog?.properties || []} activeKey={state.activeLayer} mode={compareMode} onModeChange={setCompareMode} onSelect={selectLayer} onClose={()=>setCompareOpen(false)} onRemove={removeComparison}/>}
    <dialog ref={modal} className="info-dialog" onClick={event => { if (event.target===modal.current) modal.current.close(); }}><div className="dialog-top"><span className="eyebrow">MOROCCO SOIL INSIGHTS · HELP</span><Button variant="ghost" size="icon" aria-label="Close dialog" onClick={() => modal.current?.close()}><X size={19} /></Button></div>
      <h2>Your field, layer by layer.</h2>
      <p>Draw a boundary or upload a GeoJSON, then confirm your field. Click a sheet in the floating 3D stack to update its map. Drag to rotate, scroll to zoom, and hover a layer to see its reading.</p>
      <p>Use Add another land on the map to draw or upload Land B, then confirm. Compare readings or open both fields in 3D. Differences are calculated only for matching sources, depths, units and measurement methods. Comparison stays in this session.</p>
      <p>The five sheets represent different properties, not underground depths. Their colours come from the available map pixels. Drag to rotate. Use Terrain to see the land’s actual shape.</p>
      <details><summary>Data sources & attribution</summary><p>All displayed soil values are map predictions. Finer pixels do not guarantee more accurate measurements.</p><h3>iSDAsoil · primary</h3><p>Public 30 m rasters, usually at 0–20 and 20–50 cm. Attribution: iSDA, CC BY 4.0.</p><h3>SoilGrids · additional layers</h3><p>ISRIC’s 250 m soil maps. Native depth intervals and measurement methods remain distinct. Attribution: ISRIC — World Soil Information, CC BY 4.0.</p><h3>Copernicus DEM GLO-30</h3><p>Surface elevation may include buildings and vegetation. Contains modified Copernicus Service information [2021].</p><h3>Fertimap</h3><p>Disabled pending clarification of reuse permissions.</p><p className="dialog-links"><a href="https://www.isda-africa.com/isdasoil/" target="_blank" rel="noreferrer">iSDAsoil ↗</a><a href="https://docs.isric.org/globaldata/soilgrids/" target="_blank" rel="noreferrer">SoilGrids ↗</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 ↗</a></p></details>
      {active && <details><summary>About {activeInfo?.label || active.label}</summary><p>{active.source} · {active.depth} · {active.unit} · {active.native_resolution_m} m</p><p>{active.method}</p>{active.uncertainty && <p>Uncertainty: {active.uncertainty.low!=null && active.uncertainty.high!=null ? `${pretty(active.uncertainty.low)}–${pretty(active.uncertainty.high)} ${active.uncertainty.unit || ""}` : active.uncertainty.value!=null ? `${pretty(active.uncertainty.value)} ${active.uncertainty.unit || ""}` : "Available"}. {active.uncertainty.kind}. {active.uncertainty.note}</p>}{allValues.filter(v => v.property===state.activeLayer).map((v,i)=><p key={i}>{v.source} · {v.depth}: {v.status==="ok" && v.value!==null ? `${pretty(v.value)} ${v.unit}` : "Unavailable"}</p>)}</details>}
      <details><summary>Upload & setup</summary><p>One Polygon or MultiPolygon. Up to 5 MB, 10,000 vertices and 1,000 hectares. Analysis starts only after confirmation.</p><p>For setup, add your public Mapbox token to <code>frontend/.env.local</code> and restart Next.js. Backend port: 8010.</p></details>
      {state.field?.warnings.map(message=><p key={message}>{message}</p>)}
      {[...(state.analysis?.issues || []), ...(state.terrain?.issues || [])].map((issue,i)=><p key={i}>{issue}</p>)}
    </dialog>
  </main>;
}
