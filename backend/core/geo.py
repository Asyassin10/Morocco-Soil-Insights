"""Strict single-field validation; never silently repair a user's boundary."""
import math

from pyproj import CRS, Geod, Transformer
from shapely.geometry import shape, mapping
from shapely.geometry.polygon import orient
from shapely.ops import transform
from shapely.validation import explain_validity

from .config import MAX_AREA_HA

GEOD = Geod(ellps="WGS84")


def unwrap_geojson(obj: dict) -> dict:
    if not isinstance(obj, dict):
        raise ValueError("Expected a GeoJSON object.")
    kind = obj.get("type")
    if kind == "FeatureCollection":
        features = obj.get("features")
        if not isinstance(features, list) or len(features) != 1:
            raise ValueError("Upload exactly one field. Multi-field files are not supported.")
        return unwrap_geojson(features[0])
    if kind == "Feature":
        return unwrap_geojson(obj.get("geometry"))
    if kind not in ("Polygon", "MultiPolygon"):
        raise ValueError("A Polygon or MultiPolygon field boundary is required; points and lines are not supported.")
    return obj


def validate_field(obj: dict) -> dict:
    geometry = unwrap_geojson(obj)
    count = 0

    def coordinates(node):
        nonlocal count
        if not isinstance(node, (list, tuple)) or not node:
            raise ValueError("Invalid or empty coordinates.")
        if isinstance(node[0], (int, float)):
            if len(node) < 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in node):
                raise ValueError("Coordinates must be finite longitude, latitude numbers.")
            lon, lat = node[:2]
            if not -180 <= lon <= 180 or not -90 <= lat <= 90:
                raise ValueError("Coordinates are out of range. Expected longitude, latitude.")
            count += 1
            if count > 10000:
                raise ValueError("The boundary is too detailed. Use at most 10,000 vertices.")
        else:
            for child in node:
                coordinates(child)

    coordinates(geometry.get("coordinates"))
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    for polygon in polygons:
        for ring in polygon:
            if len(ring) < 4 or ring[0][:2] != ring[-1][:2]:
                raise ValueError("Polygon rings must be closed and contain at least three distinct points.")
            if len({tuple(p[:2]) for p in ring[:-1]}) < 3:
                raise ValueError("At least three distinct geographic points are required.")
    try:
        geom = shape(geometry)
    except Exception as exc:
        raise ValueError("The polygon coordinates could not be read.") from exc
    if geom.is_empty or not geom.is_valid:
        raise ValueError(f"Invalid field boundary: {explain_validity(geom)}. Check for self-intersections.")
    minx, miny, maxx, maxy = geom.bounds
    if maxx - minx > 3 or maxy - miny > 3:
        raise ValueError("The boundary is too large for a single field.")
    parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    area = sum(abs(GEOD.geometry_area_perimeter(orient(g, sign=1))[0]) for g in parts) / 10000
    if not 0.001 <= area <= MAX_AREA_HA:
        raise ValueError(f"Field area must be between 0.001 and {MAX_AREA_HA:,} hectares.")
    center = geom.representative_point()
    zone = max(1, min(60, int((center.x + 180) // 6) + 1))
    epsg = (32600 if center.y >= 0 else 32700) + zone
    warnings = []
    if minx < -17.5 or maxx > -0.9 or miny < 20.5 or maxy > 36.2:
        warnings.append("This field is outside the approximate Morocco focus area; provider coverage may differ.")
    return {"geometry": mapping(geom), "area_ha": round(area, 4), "bounds": list(geom.bounds),
            "center": [center.x, center.y], "utm_epsg": epsg, "warnings": warnings}


def projected_geometry(field):
    transformer = Transformer.from_crs(4326, field["utm_epsg"], always_xy=True)
    return transform(transformer.transform, shape(field["geometry"]))
