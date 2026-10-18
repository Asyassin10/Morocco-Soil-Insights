import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { api } from "./api";

export type CellLayer = FeatureCollection<Polygon | MultiPolygon>;
const layers = new Map<string,CellLayer>();
export async function getLayer(url:string, signal?:AbortSignal):Promise<CellLayer> {
  if(layers.has(url)) return layers.get(url)!;
  const data=await api<CellLayer>(url,undefined,signal);
  if(!signal?.aborted){
    if(layers.size>=64) layers.delete(layers.keys().next().value!);
    layers.set(url,data);
  }
  return data;
}
