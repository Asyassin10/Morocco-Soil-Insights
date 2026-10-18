"""Copernicus GLO-30 access and derivatives adapted from the MIT reference project."""
import math
import numpy as np
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform
import rasterio
from rasterio.merge import merge
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from ..core import cache
from ..core.config import GDAL_ENV, MAX_RASTER_CELLS
from .raster import summarize


def slope_aspect(dem, dx, dy):
    dz_row,dz_col = np.gradient(dem)
    east,north = dz_col/dx, -dz_row/dy
    slope = np.degrees(np.arctan(np.hypot(east,north)))
    aspect = (np.degrees(np.arctan2(-east,-north))+360)%360
    return slope,aspect


def tile_url(lat, lon):
    name = f"Copernicus_DSM_COG_10_{'N' if lat>=0 else 'S'}{abs(lat):02d}_00_{'E' if lon>=0 else 'W'}{abs(lon):03d}_00_DEM"
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


def analyze(field):
    key = cache.cache_key("terrain-v1", field["geometry"])
    hit = cache.get(key, ttl=7*86400)
    if hit:
        return hit
    try:
        west,south,east,north = field["bounds"]
        margin = .002
        bounds = (west-margin,south-margin,east+margin,north+margin)
        urls = [tile_url(y,x) for y in range(math.floor(bounds[1]),math.floor(bounds[3])+1)
                for x in range(math.floor(bounds[0]),math.floor(bounds[2])+1)]
        datasets = []
        try:
            with rasterio.Env(**GDAL_ENV):
                for url in urls:
                    datasets.append(rasterio.open("/vsicurl/"+url))
                data,tr = merge(datasets,bounds=bounds,masked=True)
                crs = datasets[0].crs
        finally:
            for ds in datasets:
                ds.close()
        dem = data[0]
        if dem.size>MAX_RASTER_CELLS:
            raise ValueError("Terrain window is too large.")
        if np.ma.getmaskarray(dem).any():
            if dem.count()==0:
                raise ValueError("No elevation coverage.")
            filled = dem.filled(float(dem.mean()))
        else:
            filled = dem.data
        dx = abs(tr.a)*111320*math.cos(math.radians(field["center"][1]))
        dy = abs(tr.e)*110574
        slope,aspect = slope_aspect(filled,dx,dy)
        # Mask invalid elevation and its neighbouring derivatives rather than invent data.
        valid = ~np.ma.getmaskarray(dem)
        derivative_valid = valid.copy()
        for dr,dc in [(0,1),(0,-1),(1,0),(-1,0)]:
            derivative_valid &= np.roll(valid,(dr,dc),(0,1))
        derivative_valid[[0,-1],:]=False
        derivative_valid[:,[0,-1]]=False
        inside = geometry_mask([field["geometry"]],out_shape=dem.shape,transform=tr,invert=True,all_touched=True)
        layers=[]
        for prop,label,unit,arr,mask in [("elevation","Elevation","m",filled,valid), ("slope","Slope","°",slope,derivative_valid),
                                         ("aspect","Aspect","°",aspect,derivative_valid & (slope>=.5))]:
            a=np.ma.array(arr,mask=~inside | ~mask)
            info=summarize(a[None,:,:],tr,crs,field["geometry"],"Copernicus DEM",prop,"surface",None)
            if prop=="aspect" and a.count():
                angle=np.radians(a.compressed())
                # Circular field mean, never an arithmetic average across the north boundary.
                info["value"]=round(float(np.degrees(np.arctan2(np.sin(angle).mean(),np.cos(angle).mean()))%360),2)
            layers.append({"property":prop,"label":label,"unit":unit,"source":"Copernicus DEM","depth":"Surface",
                           "method":"Digital surface model; may include trees and buildings","native_resolution_m":30,"estimated":True,**info})
        # A bounded mesh window for the optional preview; downsampling is explicitly labelled.
        stride=max(1,math.ceil(max(dem.shape)/80))
        mesh=np.where(inside & valid,filled,np.nan)[::stride,::stride]
        rows=[[None if not math.isfinite(float(v)) else float(v) for v in row] for row in mesh]
        result={"field":field,"values":layers,"mesh":{"rows":rows,"dx":dx*stride,"dy":dy*stride,"native_resolution_m":30,
                "preview_stride":stride},"issues":[],"cached":False}
        return cache.put(key,result)
    except Exception as exc:
        return {"field":field,"values":[],"mesh":None,"issues":[f"Terrain is unavailable ({type(exc).__name__}). Soil analysis can still be used."],"cached":False}
