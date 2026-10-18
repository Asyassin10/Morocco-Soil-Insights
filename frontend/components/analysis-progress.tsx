"use client";
import { useEffect, useRef } from "react";
import { Check, Circle, FlaskConical, Leaf, Sprout, Shapes, Droplets, Mountain, Layers3, MapPinned, LoaderCircle, Minus } from "lucide-react";
import type { SoilProgress } from "@/lib/types";

export type StepStatus = "waiting" | "working" | "ok" | "unavailable" | "partial";
export type ProgressState = {
  boundary: StepStatus; terrain: StepStatus; layers: StepStatus;
  planned: boolean; tasks: Record<string,{property:string;status:StepStatus}>;
};
export const initialProgress = ():ProgressState => ({boundary:"working",terrain:"waiting",layers:"waiting",planned:false,tasks:{}});
export function applyProgress(state:ProgressState,event:SoilProgress):ProgressState {
  if(event.type==="start") return {...state,planned:true,tasks:Object.fromEntries(event.tasks.map(t=>[`${t.source}|${t.property}`,{property:t.property,status:"waiting" as StepStatus}]))};
  const id=`${event.source}|${event.property}`;
  return {...state,tasks:{...state.tasks,[id]:{property:event.property,status:event.type==="working" ? "working" : event.status==="ok" ? "ok" : "unavailable"}}};
}
function groupStatus(state:ProgressState,properties:string[]):StepStatus {
  const tasks=Object.values(state.tasks).filter(t=>properties.includes(t.property));
  if(!tasks.length) return state.planned ? "unavailable" : "waiting";
  if(tasks.every(t=>t.status==="ok"))return "ok";
  if(tasks.every(t=>t.status==="ok" || t.status==="unavailable"))return tasks.some(t=>t.status==="ok") ? "partial" : "unavailable";
  return tasks.some(t=>t.status!=="waiting") ? "working" : "waiting";
}
export function AnalysisProgress({progress,onCancel}:{progress:ProgressState;onCancel:()=>void}) {
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{panel.current?.focus();},[]);
  const steps=[
    {label:"Field boundary",icon:MapPinned,status:progress.boundary},
    {label:"Soil pH",icon:FlaskConical,status:groupStatus(progress,["ph"])},
    {label:"Organic carbon",icon:Leaf,status:groupStatus(progress,["organic_carbon"])},
    {label:"Total nitrogen",icon:Sprout,status:groupStatus(progress,["nitrogen"])},
    {label:"Soil composition",icon:Shapes,status:groupStatus(progress,["clay","sand","silt","bulk_density","cec","stones","bedrock_depth","carbon_stock"])},
    {label:"Nutrients",icon:Sprout,status:groupStatus(progress,["phosphorus","potassium","calcium","magnesium","iron","zinc"])},
    {label:"Water holding",icon:Droplets,status:groupStatus(progress,["water_retention_33","water_retention_1500"])},
    {label:"Terrain",icon:Mountain,status:progress.terrain},
    {label:"Prepare 3D layers",icon:Layers3,status:progress.layers},
  ];
  const tasks=[progress.boundary,progress.terrain,progress.layers,...Object.values(progress.tasks).map(t=>t.status)];
  const complete=tasks.filter(s=>["ok","unavailable","partial"].includes(s)).length;
  const percent=progress.planned ? Math.floor(complete/tasks.length*100) : undefined;
  return <div className="analysis-overlay"><div ref={panel} tabIndex={-1} className="analysis-dialog" role="dialog" aria-labelledby="analysis-title" aria-describedby="analysis-summary">
    <div className="analysis-dialog-top"><div className="analysis-orbit"><Layers3 size={22}/></div><div><h2 id="analysis-title">Analysing your field</h2><p id="analysis-summary">Building your soil layers</p></div><span className="analysis-percent">{percent===undefined ? "…" : `${percent}%`}</span></div>
    <div className={`analysis-bar ${percent===undefined ? "indeterminate" : ""}`} role="progressbar" aria-label="Field analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:percent===undefined ? "30%" : `${percent}%`}}/></div>
    <ol className="analysis-steps" aria-live="polite" aria-relevant="text">{steps.map(({label,icon:Icon,status})=><li key={label} className={`step-${status}`}><Icon size={17}/><span>{label}</span><small>{status==="ok" ? "Done" : status==="partial" ? "Partial" : status==="unavailable" ? "Unavailable" : status==="working" ? "In progress" : "Waiting"}</small>{status==="ok" ? <Check size={15}/> : status==="working" ? <LoaderCircle size={15} className="spin"/> : status==="partial" || status==="unavailable" ? <Minus size={15}/> : <Circle size={12}/>}</li>)}</ol>
    <button className="analysis-cancel" onClick={onCancel}>Cancel analysis</button>
  </div></div>;
}
