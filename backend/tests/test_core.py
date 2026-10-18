import json
import math
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from rasterio.transform import from_origin

from backend.main import app
from backend.core import cache
from backend.core.geo import validate_field, projected_geometry
from backend.services import analysis, fertimap, isdasoil, soilgrids
from backend.services.catalog import equivalent
from backend.services.raster import decode, summarize
from backend.services.terrain import slope_aspect

FIELD = {"type":"Polygon","coordinates":[[[-5.582,33.802],[-5.580,33.802],[-5.580,33.804],[-5.582,33.804],[-5.582,33.802]]]}
BENCH = json.loads((Path(__file__).parent/"fixtures/morocco_benchmark.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(cache,"CACHE_DIR",tmp_path)


@pytest.mark.parametrize("wrapper",[lambda g:g,lambda g:{"type":"Feature","properties":{},"geometry":g},lambda g:{"type":"FeatureCollection","features":[{"type":"Feature","geometry":g}]}])
def test_single_field_shapes(wrapper):
    field=validate_field(wrapper(FIELD))
    assert 3.5<field["area_ha"]<4.5
    assert field["utm_epsg"]==32630
    assert abs(projected_geometry(field).area/10000-field["area_ha"])<.02


def test_morocco_utm_zone_changes():
    g={"type":"Polygon","coordinates":[[[-9.152,30.380],[-9.150,30.380],[-9.150,30.382],[-9.152,30.382],[-9.152,30.380]]]}
    assert validate_field(g)["utm_epsg"]==32629


def test_holes_and_multipolygon():
    with_hole=json.loads(json.dumps(FIELD))
    with_hole["coordinates"].append([[-5.5818,33.8022],[-5.5818,33.8025],[-5.5815,33.8025],[-5.5815,33.8022],[-5.5818,33.8022]])
    assert validate_field(with_hole)["area_ha"] < validate_field(FIELD)["area_ha"]
    multi={"type":"MultiPolygon","coordinates":[with_hole["coordinates"]]}
    assert validate_field(multi)["geometry"]["type"]=="MultiPolygon"


@pytest.mark.parametrize("geometry",[
    {"type":"Point","coordinates":[-5,33]},
    {"type":"Polygon","coordinates":[[[0,0],[0,0],[0,0],[0,0]]]},
    {"type":"Polygon","coordinates":[[[-5.582,33.802],[-5.58,33.804],[-5.582,33.804],[-5.58,33.802],[-5.582,33.802]]]},
    {"type":"Polygon","coordinates":[[[181,33],[182,33],[182,34],[181,33]]]},
    {"type":"Polygon","coordinates":[[[-5,33],[-5.1,33],[-5.1,33.1]]]},
    {"type":"FeatureCollection","features":[{"type":"Feature","geometry":FIELD}]*2},
])
def test_invalid_geometry_rejected(geometry):
    with pytest.raises(ValueError): validate_field(geometry)


def test_benchmark_decoding_and_missing_coverage():
    for item in BENCH["raster_results"]:
        if item["provider"]!="isda":continue
        for sample in item["sites"]:
            for index,(band,value) in enumerate(sample.get("values",{}).items()):
                expected=decode(sample["raw"][index],item["metadata"].get("back-transformation"))
                assert expected==pytest.approx(value) if value is not None else expected is None
        arid=next(s for s in item["sites"] if s["site"]=="arid")
        assert arid["status"]=="nodata"


def test_unknown_encoding_never_evaluated():
    with pytest.raises(ValueError):decode(10,"__import__('os')")


def test_nitrogen_uses_original_dataset_specification_not_incorrect_storage_metadata(monkeypatch):
    record=next(x for x in BENCH["raster_results"] if x["provider"]=="isda" and x["property"]=="nitrogen_total")
    assert record["metadata"]["back-transformation"]=="expm1(x/10)"
    arr=np.ma.array([[[70.]],[[70.]],[[8.]],[[7.]]],mask=np.zeros((4,1,1),dtype=bool))
    monkeypatch.setattr(isdasoil,"get_metadata",lambda prop:record["metadata"])
    monkeypatch.setattr(isdasoil,"read_window",lambda *args:(arr,from_origin(-5.582,33.804,.002,.002),"EPSG:4326",np.ones((1,1),dtype=bool)))
    value=isdasoil.fetch(validate_field(FIELD),"nitrogen")
    assert value["value"]==pytest.approx(math.expm1(.7),abs=.0001)
    assert value["unit"]=="g/kg" and value["value"]<2


def test_missing_values_never_zero_and_layers_clip():
    tr=from_origin(-5.582,33.804,.001,.001)
    arr=np.ma.array([[[0,7],[8,9]]],mask=[[[False,True],[False,False]]])
    result=summarize(arr,tr,"EPSG:4326",FIELD,"test","ph","0-20",None)
    assert result["min"]==8 and result["max"]==9
    layer=cache.get_layer(result["layer_url"].split("/")[-1])
    assert len(layer["features"])==2
    empty=summarize(np.ma.masked_all((1,2,2)),tr,"EPSG:4326",FIELD,"test","ph","0-20",None)
    assert empty["value"] is None and empty["status"]=="no_coverage"


def test_fertimap_zero_and_nonfinite_filter():
    text=''.join(f'<INPUT ID="{k}" VALUE="0">' for k in ["ph","mo","p","k"])
    assert all(v is None for v in fertimap.parse_values(text).values())
    text=''.join(f'<INPUT ID="{k}" VALUE="{v}">' for k,v in {"ph":7.65,"mo":1.46,"p":9.3,"k":130.7}.items())
    assert fertimap.parse_values(text)["ph"]==7.65


def test_optional_fertimap_classifications_keep_text(monkeypatch):
    from backend.schemas import SoilValue
    monkeypatch.setattr(fertimap,"ENABLE_FERTIMAP",True)
    content='<table><tr><th>Type de sol</th><td>Sols alluviaux</td></tr><tr><th>Texture globale</th><td>Info non encore introduite</td></tr></table>'
    class Response:
        text=content
        def raise_for_status(self):pass
    monkeypatch.setattr(fertimap.httpx,"get",lambda *args,**kwargs:Response())
    rows=fertimap.fetch(validate_field(FIELD))
    classification=next(v for v in rows if v["property"]=="soil_class")
    assert SoilValue.model_validate(classification).text_value=="Sols alluviaux"
    assert next(v for v in rows if v["property"]=="texture_class")["status"]=="no_coverage"


def test_fallback_preserves_depth_and_method():
    base={"property":"ph","source":"iSDAsoil","unit":"pH","depth":"0-20 cm","method":"water","status":"no_coverage"}
    other={**base,"source":"SoilGrids","status":"ok","depth":"0-5 cm"}
    assert not equivalent(base,other)
    assert "ph" not in analysis.preferred_sources([base,other])
    other["depth"]="0-20 cm"
    assert analysis.preferred_sources([base,other])["ph"]=="SoilGrids"
    other["method"]="CaCl2"
    assert not equivalent(base,other)


def test_cache_reuse_and_provider_failure(monkeypatch):
    calls=[]
    def good(field,key,depth):
        calls.append(key)
        return {"property":key,"label":"pH","unit":"pH","depth":"0-20 cm","method":"water","status":"ok","source":"iSDAsoil","value":6.7}
    def broken(*args):raise OSError("offline")
    monkeypatch.setattr(isdasoil,"fetch",good)
    monkeypatch.setattr(soilgrids,"fetch",broken)
    field=validate_field(FIELD)
    first=analysis.analyze(field,["ph"])
    second=analysis.analyze(field,["ph"])
    assert first["preferred"]=={"ph":"iSDAsoil"} and first["issues"]
    assert len(calls)==1 # Successful provider cached independently of failed provider.
    assert second["values"][0]["value"]==6.7


def test_api_contract_and_validation(monkeypatch):
    client=TestClient(app)
    assert client.get("/api/health").json()["status"]=="ok"
    catalog=client.get("/api/soil/catalog")
    assert catalog.status_code==200
    ph=next(p for p in catalog.json()["properties"] if p["id"]=="ph")
    assert ph["range"]==[4,9] and ph["sources"]==["iSDAsoil","SoilGrids"]
    assert client.post("/api/fields/validate",json={"geojson":FIELD}).status_code==200
    assert client.post("/api/fields/validate",json={"geojson":{"type":"Point","coordinates":[0,0]}}).status_code==422
    assert client.get("/api/layers/not-a-key").status_code==404
    assert client.post("/api/soil/analyze",json={"geojson":FIELD,"properties":["invented"]}).status_code==422
    assert client.post("/api/soil/analyze",json={"geojson":FIELD,"depth":"0-20"}).status_code==422
    assert client.post("/api/fields/validate",content=b' '*(5*1024*1024+10001),headers={"content-type":"application/json"}).status_code==413


def test_terrain_direction():
    rows,cols=np.mgrid[:20,:20]
    slope,aspect=slope_aspect(cols*3.,30,30)
    assert slope[10,10]==pytest.approx(np.degrees(np.arctan(.1)))
    assert aspect[10,10]==270
    slope,aspect=slope_aspect((19-rows)*3.,30,30)
    assert aspect[10,10]==180
