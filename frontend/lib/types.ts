import type { Polygon, MultiPolygon } from "geojson";

export type Geometry = Polygon | MultiPolygon;
export type Source = "iSDAsoil" | "SoilGrids" | "Fertimap" | "Copernicus DEM";
export type FieldInfo = { geometry: Geometry; area_ha: number; bounds: number[]; center: [number, number]; utm_epsg: number; warnings: string[] };
export type SoilValue = {
  property: string; label: string; value: number | null; text_value?: string | null; unit: string; source: Source; depth: string; method: string;
  status: "ok" | "no_coverage" | "error" | "disabled"; estimated: boolean;
  uncertainty?: { kind: string; unit?: string; value?: number | null; low?: number | null; high?: number | null; note?: string | null } | null;
  native_resolution_m?: number | null; layer_url?: string | null; coverage_pct: number; min?: number | null; max?: number | null; message?: string | null;
};
export type Analysis = { field: FieldInfo; values: SoilValue[]; preferred: Record<string, string>; issues: string[]; cached: boolean };
export type SavedLand = { name: string; field: FieldInfo; analysis: Analysis; terrain: Terrain | null };
export type SoilProgress =
  | { type: "start"; tasks: { property: string; source: string }[] }
  | { type: "working"; property: string; source: string }
  | { type: "property"; property: string; source: string; status: SoilValue["status"] };
export type Terrain = { field: FieldInfo; values: SoilValue[]; issues: string[]; mesh: { rows: (number | null)[][]; dx: number; dy: number; native_resolution_m: number; preview_stride: number } | null };
export type CatalogItem = { id: string; label: string; unit: string; group: string; range: [number, number]; sources: string[] };
export type Catalog = { properties: CatalogItem[]; sources: string[]; fertimap_enabled: boolean; soilgrids_depths: string[]; isdasoil_depths: string[] };
