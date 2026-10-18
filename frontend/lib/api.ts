import type { Analysis, Catalog, FieldInfo, Geometry, SoilProgress, Terrain } from "./types";

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal, cache: "no-store" });
  if (!response.ok) {
    let message = "The service could not complete this request.";
    try { const data = await response.json(); message = typeof data.detail === "string" ? data.detail : message; } catch { /* Non-JSON gateway response. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export const validate = (geojson: unknown, signal?: AbortSignal) => api<FieldInfo>("/api/fields/validate", { geojson }, signal);
export async function analyze(geometry: Geometry, signal?: AbortSignal, options?: { properties: string[]; source: string; depth: string }, onProgress?: (event: SoilProgress) => void): Promise<Analysis> {
  if (!onProgress) return api<Analysis>("/api/soil/analyze", { geojson: geometry, ...options }, signal);
  const response = await fetch("/api/soil/analyze", { method:"POST", headers:{"Content-Type":"application/json","Accept":"application/x-ndjson"}, body:JSON.stringify({geojson:geometry,...options}), signal, cache:"no-store" });
  if (!response.ok) {
    const error = await response.json().catch(()=>null);
    throw new Error(typeof error?.detail==="string" ? error.detail : "Soil analysis could not finish. Please retry.");
  }
  // JSON remains supported for older backends and deterministic recorded responses.
  if (!response.headers.get("Content-Type")?.includes("application/x-ndjson")) return response.json();
  if (!response.body) throw new Error("The progress connection could not open.");
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let pending="", result:Analysis|undefined;
  const consume=(line:string)=>{
    if (!line.trim()) return;
    const event=JSON.parse(line);
    if(event.type==="complete") result=event.result;
    else if(event.type==="error") throw new Error(event.message || "Soil analysis could not finish.");
    else if(["start","working","property"].includes(event.type)) onProgress(event);
  };
  try {
    while(true){
      const {value,done}=await reader.read();
      pending+=decoder.decode(value,{stream:!done});
      const lines=pending.split("\n");pending=lines.pop() || "";lines.forEach(consume);
      if(done){consume(pending);break;}
    }
  } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
  if(!result) throw new Error("The connection ended before soil analysis finished. Please retry.");
  return result;
}
export const terrain = (geometry: Geometry, signal?: AbortSignal) => api<Terrain>("/api/terrain/analyze", { geojson: geometry }, signal);
export const catalog = (signal?: AbortSignal) => api<Catalog>("/api/soil/catalog", undefined, signal);

export function readFile(file: File): Promise<unknown> {
  if (!/\.(geojson|json)$/i.test(file.name)) return Promise.reject(new Error("Choose a .geojson or .json file."));
  if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error("Files must be 5 MB or smaller."));
  return file.text().then((text) => { try { return JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); } });
}
