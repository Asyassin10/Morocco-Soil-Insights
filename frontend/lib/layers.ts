import { FlaskConical, Leaf, Sprout, CircleDot, Droplets, Mountain, Compass, Layers3, Gem, Weight, MoveDown, CircleGauge, Atom, Shapes } from "lucide-react";

export const LAYERS: Record<string, { label: string; icon: typeof Leaf; color: string; description: string }> = {
  ph: { label: "Soil pH", icon: FlaskConical, color: "#D35E24", description: "How acidic or alkaline your soil is." },
  organic_carbon: { label: "Organic carbon", icon: Leaf, color: "#A64135", description: "Carbon stored in soil organic material." },
  nitrogen: { label: "Total nitrogen", icon: Sprout, color: "#B47E14", description: "The soil’s total nitrogen reserve." },
  clay: { label: "Clay", icon: Shapes, color: "#B84A3A", description: "Fine particles that help soil hold water and nutrients." },
  sand: { label: "Sand", icon: CircleDot, color: "#C6B57C", description: "Coarse particles that influence drainage." },
  silt: { label: "Silt", icon: CircleDot, color: "#B6A082", description: "Medium-sized particles in your soil." },
  bulk_density: { label: "Bulk density", icon: Weight, color: "#8B917B", description: "How much dry soil occupies a given volume." },
  cec: { label: "Nutrient capacity", icon: Atom, color: "#9F9C66", description: "The soil’s ability to retain nutrient ions." },
  stones: { label: "Stones", icon: Gem, color: "#929B94", description: "The share of coarse fragments in your soil." },
  bedrock_depth: { label: "Bedrock depth", icon: MoveDown, color: "#9F8D76", description: "Estimated distance to solid rock." },
  carbon_stock: { label: "Carbon stock", icon: Leaf, color: "#628168", description: "The amount of carbon stored per unit of land." },
  phosphorus: { label: "Phosphorus", icon: Sprout, color: "#AE9871", description: "An extractable phosphorus estimate." },
  potassium: { label: "Potassium", icon: Sprout, color: "#A89C63", description: "An extractable potassium estimate." },
  calcium: { label: "Calcium", icon: Gem, color: "#A6AE89", description: "An extractable calcium estimate." },
  magnesium: { label: "Magnesium", icon: Gem, color: "#859D87", description: "An extractable magnesium estimate." },
  iron: { label: "Iron", icon: Gem, color: "#B18465", description: "An extractable iron estimate." },
  zinc: { label: "Zinc", icon: Gem, color: "#8A9DA3", description: "An extractable zinc estimate." },
  water_retention_33: { label: "Water holding", icon: Droplets, color: "#6F9DAB", description: "Water retained at a soil suction of 33 kPa." },
  water_retention_1500: { label: "Wilting point", icon: Droplets, color: "#819EB0", description: "Water retained at 1500 kPa, much of it difficult for plants to access." },
  elevation: { label: "Elevation", icon: Mountain, color: "#8B9B74", description: "Height above sea level." },
  slope: { label: "Slope", icon: CircleGauge, color: "#A69C7A", description: "How steep your field is." },
  aspect: { label: "Direction", icon: Compass, color: "#8D9C8C", description: "The direction the land slopes toward." },
};
export const STACK_KEYS = ["ph", "organic_carbon", "nitrogen", "clay", "water_retention_33"];
// Sequential scales show magnitude, not good/bad soil or crop suitability.
export function layerPalette(key: string): [string, string, string] {
  if (key.startsWith("water_") || key === "aspect") return ["#D7EDF1", "#5AA6BC", "#235B83"];
  if (key === "organic_carbon" || key === "carbon_stock") return ["#FFF0CA", "#DE8754", "#8B3434"];
  if (key === "nitrogen" || key === "cec") return ["#FFF5B5", "#F2BB42", "#C76520"];
  return ["#FFF1A8", "#F49B37", "#C63936"];
}
export const fallbackIcon = Layers3;
