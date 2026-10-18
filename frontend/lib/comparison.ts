import type { SavedLand, SoilValue } from "./types";

export function landValues(land: SavedLand) {
  return [...land.analysis.values, ...(land.terrain?.values || [])];
}

// A number in the same unit is insufficient: analytical method and depth must match.
export function compatible(a: SoilValue, b: SoilValue) {
  return a.source === b.source && a.depth === b.depth && a.unit === b.unit && a.method === b.method;
}

export function compareProperty(a: SavedLand, b: SavedLand, key: string) {
  const av = landValues(a).filter(v => v.property === key);
  const bv = landValues(b).filter(v => v.property === key);
  const valid = (v: SoilValue) => v.status === "ok" && v.value !== null && Number.isFinite(v.value);
  const preferred = (land: SavedLand, values: SoilValue[]) => values.find(v => valid(v) && v.source === land.analysis.preferred[key]) || values.find(valid) || values[0];
  const first = preferred(a, av);
  const ordered = first ? [first, ...av.filter(v => v !== first)] : av;
  for (const left of ordered.filter(valid)) {
    const right = bv.find(v => valid(v) && compatible(left, v));
    if (right) return { a: left, b: right, difference: right.value! - left.value!, reason: null };
  }
  const second = preferred(b, bv);
  return { a: first, b: second, difference: null, reason: first && second && valid(first) && valid(second) ? "Different measurements" : "Missing data" };
}
