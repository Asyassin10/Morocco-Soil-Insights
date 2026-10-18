import type { Page } from "@playwright/test";
import type { FieldInfo } from "../lib/types";
import type { Polygon } from "geojson";
export const geometry: Polygon = { type: "Polygon", coordinates: [[[-5.582,33.802],[-5.580,33.802],[-5.580,33.804],[-5.582,33.804],[-5.582,33.802]]] };
export const field: FieldInfo = { geometry, area_ha: 4.1, bounds: [-5.582,33.802,-5.58,33.804], center: [-5.581,33.803], utm_epsg: 32630, warnings: [] };
export function uploadPayload(value: unknown = geometry, name="meknes.geojson") { return { name, mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(value)) }; }
export const soil = (source: string, value: number, depth: string) => ({ property: "ph", label: "Soil pH", value, unit: "pH", source, depth, method: "pH in water", status: "ok", estimated: true, native_resolution_m: source==="iSDAsoil" ? 30 : 250, layer_url: "/api/layers/"+"a".repeat(64), coverage_pct: 100, uncertainty: null });

export async function mockAnalysis(page: Page, delayed=false) {
  await page.route("**/api/soil/analyze", async route => {
    if (delayed) await new Promise(resolve=>setTimeout(resolve,500));
    const body=route.request().postDataJSON();
    await route.fulfill({ json: { field, values: [soil("iSDAsoil",6.7,"0-20 cm"),soil("SoilGrids",7.9,body.depth ? body.depth.replace("cm"," cm") : "0-5 cm")], preferred: { ph:"iSDAsoil" }, issues: [], cached:false } });
  });
  await page.route("**/api/terrain/analyze", route=>route.fulfill({ json: { field, values:[], mesh:null, issues:[], cached:false } }));
  await page.route("**/api/layers/*", route=>route.fulfill({ json:{ type:"FeatureCollection",features:[] } }));
}
