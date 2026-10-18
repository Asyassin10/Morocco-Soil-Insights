"use client";
import { useState } from "react";
import { ArrowLeftRight, Check, Layers3, Pencil, Plus, Upload, X } from "lucide-react";
import type { SavedLand } from "@/lib/types";

export function FieldDock({ first, second, pending, busy, onAdd, onCompare, on3D, onFocus, onCancel }: {
  first:SavedLand; second:SavedLand|null; pending:boolean; busy:boolean;
  onAdd:(mode:"draw"|"upload")=>void; onCompare:()=>void; on3D:()=>void;
  onFocus:(target:"a"|"b"|"both")=>void; onCancel:()=>void;
}) {
  const [choosing,setChoosing]=useState(false);
  return <section className="field-dock" aria-label="Selected lands">
    <div className="field-dock-cards">
      <button className="dock-land" aria-label="Focus Land A" onClick={()=>onFocus(pending ? "a" : "b")}>
        <span className="land-letter land-a">A</span><span><strong>{first.name}</strong><small>{first.field.area_ha.toFixed(2)} ha</small></span><Check size={14}/>
      </button>
      {second ? <button className="dock-land" aria-label="Focus Land B" onClick={()=>onFocus("b")}><span className="land-letter land-b">B</span><span><strong>{second.name}</strong><small>{second.field.area_ha.toFixed(2)} ha</small></span><Check size={14}/></button>
        : <button className="dock-add" aria-expanded={choosing} disabled={busy} onClick={()=>setChoosing(!choosing)}><Plus size={18}/><span>{pending ? "Add Land B" : "Add another land"}</span></button>}
    </div>
    {(choosing || (pending && !second)) && <div className="dock-add-options"><span>{busy ? "Analysing Land B…" : "Choose your next land"}</span><button disabled={busy} onClick={()=>{setChoosing(false);onAdd("draw");}}><Pencil size={14}/>Draw boundary</button><button disabled={busy} onClick={()=>{setChoosing(false);onAdd("upload");}}><Upload size={14}/>Upload file</button>{pending && <button aria-label="Cancel comparison" onClick={onCancel}><X size={14}/></button>}</div>}
    {second && <div className="dock-comparison-actions"><button onClick={()=>onFocus("both")}>Fit both</button><button onClick={onCompare}><ArrowLeftRight size={14}/>Compare readings</button><button onClick={on3D}><Layers3 size={14}/>Compare in 3D</button></div>}
  </section>;
}
