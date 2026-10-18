import numpy as np
import httpx

from ..core import cache
from .catalog import PROPERTIES
from .raster import read_window, summarize


def encoding_for(prop, metadata):
    # Original dataset specification and Earth Engine both specify /100 for N.
    # The AWS JSON incorrectly says /10, yielding impossible g/kg values.
    # https://zenodo.org/records/4090386
    if prop == "nitrogen_total":
        return "expm1(x/100)"
    return metadata.get("back-transformation")


def get_metadata(prop):
    key = cache.cache_key("isda-metadata-v1", prop)
    meta = cache.get(key, ttl=7*86400)
    if meta is None:
        response = httpx.get(f"https://isdasoil.s3.amazonaws.com/soil_data/{prop}/{prop}.json", timeout=18)
        response.raise_for_status()
        meta = cache.put(key, response.json())
    return meta


def fetch(field, key, depth=None):
    definition = PROPERTIES[key]
    prop = definition[3]
    meta = get_metadata(prop)
    asset = meta["assets"]["image"]
    arr, tr, crs, inside = read_window(asset["href"], field["geometry"])
    bands = asset.get("eo:bands", [])
    depth = "0-200" if key == "bedrock_depth" else (depth or "0-20")
    target = f"mean_{depth.replace('-', '_')}"
    index = next((i for i,b in enumerate(bands) if b.get("name") == target), None)
    if index is None:
        raise ValueError(f"The provider does not offer {depth} cm for this property.")
    formula = encoding_for(prop, meta)
    info = summarize(arr[index:index+1], tr, crs, field["geometry"], "iSDAsoil", key, depth, formula)
    info["coverage_pct"] = round(100 * arr[index].count()/max(1, int(inside.sum())), 1) if info["status"] == "ok" else 0
    uncertainty = None
    sd_index = next((i for i,b in enumerate(bands) if b.get("name") == f"stdev_{depth.replace('-', '_')}"), None)
    if sd_index is not None and arr[sd_index].count():
        sd = float(arr[sd_index].mean())
        if formula in (None, "", "x/10", "x/100"):
            divisor = 10 if formula == "x/10" else 100 if formula == "x/100" else 1
            uncertainty = {"kind": "mean prediction standard deviation", "value": round(sd/divisor, 4), "unit": definition[1]}
        else:
            uncertainty = {"kind": "transformed-scale standard deviation", "value": round(sd, 4), "unit": "encoded scale",
                           "note": "Provider SD is on a transformed scale; it is not a physical-unit error bar."}
    method = "pH in 1:1 soil-water suspension" if key == "ph" else "effective CEC" if key == "cec" else "Mehlich-3 extraction" if definition[2] == "nutrients" else "mapped soil property"
    return {"property": key, "label": definition[0], "unit": definition[1], "source": "iSDAsoil", "depth": f"{depth} cm",
            "method": method, "estimated": True, "native_resolution_m": 30, "uncertainty": uncertainty, **info}
