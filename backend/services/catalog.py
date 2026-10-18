"""Provider definitions stay explicit: similar names need not mean equivalent methods."""
# key: label, unit, group, iSDA property, SoilGrids property, SoilGrids divisor, color limits
PROPERTIES = {
    "ph": ("Soil pH", "pH", "overview", "ph", "phh2o", 10, [4, 9]),
    "organic_carbon": ("Organic carbon", "g/kg", "overview", "carbon_organic", "soc", 10, [0, 50]),
    "nitrogen": ("Total nitrogen", "g/kg", "overview", "nitrogen_total", "nitrogen", 100, [0, 4]),
    "clay": ("Clay", "%", "overview", "clay_content", "clay", 10, [0, 60]),
    "sand": ("Sand", "%", "overview", "sand_content", "sand", 10, [0, 100]),
    "silt": ("Silt", "%", "overview", "silt_content", "silt", 10, [0, 80]),
    "bulk_density": ("Bulk density", "g/cm³", "overview", "bulk_density", "bdod", 100, [0.8, 1.8]),
    "cec": ("Nutrient holding capacity", "cmol(+)/kg", "overview", "cation_exchange_capacity", "cec", 10, [0, 40]),
    "phosphorus": ("Extractable phosphorus", "mg/kg", "nutrients", "phosphorous_extractable", None, 1, [0, 60]),
    "potassium": ("Extractable potassium", "mg/kg", "nutrients", "potassium_extractable", None, 1, [0, 500]),
    "calcium": ("Extractable calcium", "mg/kg", "nutrients", "calcium_extractable", None, 1, [0, 5000]),
    "magnesium": ("Extractable magnesium", "mg/kg", "nutrients", "magnesium_extractable", None, 1, [0, 1000]),
    "iron": ("Extractable iron", "mg/kg", "nutrients", "iron_extractable", None, 1, [0, 200]),
    "zinc": ("Extractable zinc", "mg/kg", "nutrients", "zinc_extractable", None, 1, [0, 10]),
    "stones": ("Stone content", "%", "overview", "stone_content", "cfvo", 10, [0, 40]),
    "bedrock_depth": ("Depth to bedrock", "cm", "overview", "bedrock_depth", None, 1, [0, 200]),
    "water_retention_33": ("Water retention · 33 kPa", "vol%", "water", None, "wv0033", 10, [0, 60]),
    "water_retention_1500": ("Water retention · 1500 kPa", "vol%", "water", None, "wv1500", 10, [0, 40]),
    "carbon_stock": ("Organic carbon stock", "t/ha", "overview", None, "ocs", 1, [0, 100]),
}
SG_DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"]


def catalog():
    return [{"id": key, "label": v[0], "unit": v[1], "group": v[2], "range": v[6],
             "sources": (["iSDAsoil"] if v[3] else []) + (["SoilGrids"] if v[4] else [])}
            for key, v in PROPERTIES.items()]


def equivalent(a: dict, b: dict) -> bool:
    return all(a.get(k) == b.get(k) for k in ("property", "unit", "depth", "method"))
