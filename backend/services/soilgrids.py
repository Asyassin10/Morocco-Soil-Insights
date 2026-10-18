"""Use the tested VRT route; water-retention layers use WCS TIFFs."""
import httpx
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.features import geometry_mask
from shapely.geometry import shape, mapping

from .catalog import PROPERTIES, SG_DEPTHS
from .raster import read_window, summarize


def wcs_window(prop, depth, geometry, stat="mean"):
    b = shape(geometry).bounds
    params = [("map", f"/map/{prop}.map"), ("SERVICE", "WCS"), ("VERSION", "2.0.1"),
              ("REQUEST", "GetCoverage"), ("COVERAGEID", f"{prop}_{depth}_{stat}"), ("FORMAT", "image/tiff"),
              ("SUBSETTINGCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"),
              ("OUTPUTCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"),
              ("SUBSET", f"long({b[0]-.002},{b[2]+.002})"), ("SUBSET", f"lat({b[1]-.002},{b[3]+.002})")]
    response = httpx.get("https://maps.isric.org/mapserv", params=params, timeout=18)
    response.raise_for_status()
    if "tiff" not in response.headers.get("content-type", ""):
        raise ValueError("SoilGrids returned a service error rather than raster data.")
    with MemoryFile(response.content) as mem, mem.open() as src:
        data = src.read(masked=True).astype(float)
        inside = geometry_mask([geometry], out_shape=data.shape[1:], transform=src.transform, invert=True, all_touched=True)
        data.mask = np.ma.getmaskarray(data) | (data.data == -32768) | ~inside[None,:,:]
        return data, src.transform, src.crs, inside


def fetch(field, key, depth=None):
    definition = PROPERTIES[key]
    prop = definition[4]
    depth = "0-30cm" if key == "carbon_stock" else depth or "0-5cm"
    if depth not in SG_DEPTHS and not (key == "carbon_stock" and depth == "0-30cm"):
        raise ValueError("Unsupported SoilGrids depth.")
    if prop in ("wv0033", "wv1500"):
        arr,tr,crs,inside = wcs_window(prop, depth, field["geometry"])
    else:
        arr,tr,crs,inside = read_window(f"https://files.isric.org/soilgrids/latest/data/{prop}/{prop}_{depth}_mean.vrt", field["geometry"])
    divisor = definition[5]
    values = np.ma.array(arr / divisor, mask=np.ma.getmaskarray(arr))
    info = summarize(values, tr, crs, field["geometry"], "SoilGrids", key, depth, None)
    info["coverage_pct"] = round(100 * arr[0].count()/max(1, int(inside.sum())), 1) if info["status"] == "ok" else 0
    uncertainty = None
    if key == "ph" and info["status"] == "ok":
        bounds = []
        for stat in ("Q0.05", "Q0.95"):
            try:
                a,_,_,_ = read_window(f"https://files.isric.org/soilgrids/latest/data/{prop}/{prop}_{depth}_{stat}.vrt", field["geometry"])
                bounds.append(float(a[0].mean())/divisor if a[0].count() else None)
            except Exception:
                bounds.append(None)
        if all(v is not None for v in bounds):
            uncertainty = {"kind": "mean pixel prediction bounds (90%)", "low": round(bounds[0], 3), "high": round(bounds[1], 3),
                           "unit": definition[1], "note": "Mean of pixel quantiles, not a calibrated confidence interval for the field average."}
    method = "mapped pH in water" if key == "ph" else "CEC buffered at pH 7" if key == "cec" else "mapped soil property"
    return {"property": key, "label": definition[0], "unit": definition[1], "source": "SoilGrids", "depth": depth.replace("cm", " cm"),
            "method": method, "estimated": True, "native_resolution_m": 250, "uncertainty": uncertainty, **info}
