"use client";
import dynamic from "next/dynamic";
import { ArrowLeftRight, Layers3, LocateFixed, X } from "lucide-react";
import { LAYERS, STACK_KEYS } from "@/lib/layers";
import { compareProperty } from "@/lib/comparison";
import type { SavedLand, CatalogItem, SoilValue } from "@/lib/types";

const FieldStack=dynamic(()=>import("./field-stack"),{ssr:false,loading:()=><div className="stack-loading">Opening 3D…</div>});

const format = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(n);

export function LandComparison({ first, second, onClose, onRemove, mode, onModeChange, activeKey, onSelect, ranges }: {
  first: SavedLand; second: SavedLand | null; onClose: () => void; onRemove: () => void;
  mode:"readings"|"3d"; onModeChange:(mode:"readings"|"3d")=>void;
  activeKey:string; onSelect:(key:string)=>void; ranges:CatalogItem[];
}) {
  const same = second && JSON.stringify(first.field.geometry) === JSON.stringify(second.field.geometry);
  return <section className={`land-comparison ${mode==="3d" ? "comparison-3d-mode" : ""}`} aria-label="Land comparison">
    <header><span><ArrowLeftRight size={17} /><strong>Compare lands</strong></span><button onClick={onClose} aria-label="Close comparison"><X size={17} /></button></header>
    {second && !same && <div className="comparison-view-switch" aria-label="Comparison view"><button aria-pressed={mode==="readings"} onClick={()=>onModeChange("readings")}><ArrowLeftRight size={14}/>Readings</button><button aria-pressed={mode==="3d"} onClick={()=>onModeChange("3d")}><Layers3 size={14}/>3D layers</button></div>}
    {mode!=="3d" && <div className="compare-land-headings">
      <div><span className="land-letter land-a">A</span><strong title={first.name}>{first.name}</strong><small>{format(first.field.area_ha)} ha</small></div>
      <div><span className="land-letter land-b">B</span><strong title={second?.name}>{second?.name || "Choose another land"}</strong><small>{second ? `${format(second.field.area_ha)} ha` : "Draw or upload, then confirm"}</small></div>
    </div>}
    {!second || same ? <div className="comparison-empty"><LocateFixed size={28} /><h3>{same ? "Choose a different boundary" : "Land A is saved"}</h3><p>Draw or upload a second field, then confirm it to compare.</p></div> : mode==="3d" ? <>
      <div className="comparison-stacks">{([first,second] as const).map((land,index)=>{
        const values=STACK_KEYS.map(key=>compareProperty(first,second,key)[index===0 ? "a" : "b"]).filter((v):v is SoilValue=>Boolean(v));
        return <section key={index} className="comparison-stack" aria-label={`Land ${index===0 ? "A" : "B"} 3D`}><div className="compare-stack-name"><span className={`land-letter ${index===0 ? "land-a" : "land-b"}`}>{index===0 ? "A" : "B"}</span><strong title={land.name}>{land.name}</strong><small>{format(land.field.area_ha)} ha</small></div><FieldStack field={land.field} values={values} ranges={ranges} activeKey={activeKey} onSelect={onSelect}/></section>;
      })}</div><p className="compare-note">Each field fits its own view. Select the same layer to explore both maps.</p>
    </> : <>
      <div className="comparison-table-wrap"><table><caption className="sr-only">Soil measurements for Land A and Land B. Difference is B minus A.</caption><thead><tr><th>Property</th><th>Land A</th><th>Land B</th><th>Difference</th></tr></thead><tbody>
        {Object.entries(LAYERS).map(([key, layer]) => {
          const row = compareProperty(first, second, key), Icon = layer.icon;
          const read = (v: typeof row.a) => v?.status === "ok" && v.value !== null ? format(v.value) : "—";
          return <tr key={key} data-testid={`compare-${key}`}>
            <th scope="row"><span><Icon size={15} style={{ color: layer.color }} />{layer.label}</span><small>{row.a?.unit || row.b?.unit || ""}</small></th>
            <td title={row.a ? `${row.a.source} · ${row.a.depth} · ${row.a.method}` : "No data"}>{read(row.a)}</td>
            <td title={row.b ? `${row.b.source} · ${row.b.depth} · ${row.b.method}` : "No data"}>{read(row.b)}</td>
            <td className="compare-difference">{row.difference !== null ? `${row.difference > 0 ? "+" : ""}${format(row.difference)}` : <span className="compare-missing">{row.reason}</span>}</td>
          </tr>;
        })}
      </tbody></table></div>
      <p className="compare-note">Difference = B − A. Higher does not always mean better. Map estimates.</p>
    </>}
    <footer><button onClick={onRemove}>Remove Land A</button><span>Saved for this session</span></footer>
  </section>;
}
