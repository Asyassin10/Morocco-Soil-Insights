"""Native-pixel window reading, based on the reference project's SoilGrids adapter.

Visual layers retain native pixel footprints, clipped to the confirmed field.
"""
import math
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import Window, from_bounds
from pyproj import Transformer
from shapely.geometry import shape, mapping, Polygon
from shapely.ops import transform
from pyproj import Geod

from ..core.config import GDAL_ENV, MAX_RASTER_CELLS
from ..core import cache


def decode(value, formula):
    if value is None or not math.isfinite(float(value)):
        return None
    if formula in (None, "", "None"):
        return float(value)
    if formula == "x/10":
        return float(value) / 10
    if formula == "x/100":
        return float(value) / 100
    if formula == "expm1(x/10)":
        return math.expm1(float(value) / 10)
    if formula == "expm1(x/100)":
        return math.expm1(float(value) / 100)
    raise ValueError(f"Unknown provider encoding: {formula}")


def read_window(url: str, geometry: dict):
    with rasterio.Env(**GDAL_ENV), rasterio.open("/vsicurl/" + url) as src:
        to_native = Transformer.from_crs(4326, src.crs, always_xy=True)
        native = transform(to_native.transform, shape(geometry))
        win = from_bounds(*native.bounds, src.transform)
        col = max(0, math.floor(win.col_off))
        row = max(0, math.floor(win.row_off))
        width = min(src.width - col, max(1, math.ceil(win.col_off + win.width) - col))
        height = min(src.height - row, max(1, math.ceil(win.row_off + win.height) - row))
        if width <= 0 or height <= 0:
            raise ValueError("Field is outside raster extent.")
        if width * height > MAX_RASTER_CELLS:
            raise ValueError("The field's raster window is too large. Select a more compact field.")
        window = Window(col, row, width, height)
        arr = src.read(window=window, masked=True).astype(float)
        tr = src.window_transform(window)
        inside = geometry_mask([mapping(native)], out_shape=(height, width), transform=tr, invert=True, all_touched=True)
        mask = np.ma.getmaskarray(arr) | ~inside[None, :, :] | ~np.isfinite(arr.data)
        return np.ma.array(arr.data, mask=mask), tr, src.crs, inside


def features_for(values, tr, crs, geometry):
    back = Transformer.from_crs(crs, 4326, always_xy=True)
    field = shape(geometry)
    features = []
    for r, c in zip(*np.where(~np.ma.getmaskarray(values))):
        v = float(values[r, c])
        if not math.isfinite(v):
            continue
        corners = [back.transform(*(tr * p)) for p in [(c, r), (c+1, r), (c+1, r+1), (c, r+1)]]
        clipped = Polygon(corners).intersection(field)
        if not clipped.is_empty and clipped.area > 0:
            features.append({"type": "Feature", "geometry": mapping(clipped), "properties": {"value": round(v, 5)}})
    return {"type": "FeatureCollection", "features": features}


def summarize(arr, tr, crs, geometry, provider, prop, depth, formula):
    raw = arr[0]
    decoded = np.ma.array(np.zeros(raw.shape), mask=np.ma.getmaskarray(raw).copy())
    for r, c in zip(*np.where(~np.ma.getmaskarray(raw))):
        decoded[r, c] = decode(float(raw[r, c]), formula)
    if prop == "ph":
        decoded = np.ma.masked_where((decoded <= 0) | (decoded > 14), decoded)
    if decoded.count() == 0:
        return {"status": "no_coverage", "value": None, "coverage_pct": 0, "message": "No prediction is available for this field."}
    # Area-weight field-edge pixels; preserve every valid native cell in the map layer.
    fc = features_for(decoded, tr, crs, geometry)
    layer_key = cache.cache_key("layer-v2", provider, prop, depth, geometry)
    cache.put(layer_key, fc)
    geod = Geod(ellps="WGS84")
    weights = np.array([abs(geod.geometry_area_perimeter(shape(f["geometry"]))[0]) for f in fc["features"]])
    numbers = np.array([f["properties"]["value"] for f in fc["features"]])
    mean = float(np.average(numbers, weights=weights)) if weights.sum() else float(decoded.mean())
    return {"status": "ok", "value": round(mean, 4), "min": round(float(decoded.min()), 4),
            "max": round(float(decoded.max()), 4), "coverage_pct": round(100 * decoded.count()/max(1, np.count_nonzero(~np.ma.getmaskarray(arr[0]))), 1),
            "layer_url": f"/api/layers/{layer_key}"}
