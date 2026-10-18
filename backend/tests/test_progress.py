import json
import threading
import pytest
from fastapi.testclient import TestClient
from backend.main import app, analysis_events
from backend.schemas import AnalysisRequest
from backend.services import analysis, isdasoil, soilgrids
from backend.core import cache
from backend.core.geo import validate_field

FIELD = {"type":"Polygon","coordinates":[[[-5.582,33.802],[-5.580,33.802],[-5.580,33.804],[-5.582,33.804],[-5.582,33.802]]]}


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path,monkeypatch):
    monkeypatch.setattr(cache,"CACHE_DIR",tmp_path)


def value(source,status="ok"):
    return {"property":"ph","label":"Soil pH","unit":"pH","depth":"0-20 cm","method":"water",
            "status":status,"source":source,"value":6.7 if status=="ok" else None}


def test_progress_reports_completion_order_and_cached_results(monkeypatch):
    primary_started=threading.Event()
    release_primary=threading.Event()
    events=[]
    def primary(*args):
        primary_started.set()
        assert release_primary.wait(3)
        return value("iSDAsoil")
    def secondary(*args):
        assert primary_started.wait(3)
        return value("SoilGrids")
    def progress(event):
        events.append(event)
        if event["type"]=="property" and event["source"]=="SoilGrids": release_primary.set()
    monkeypatch.setattr(isdasoil,"fetch",primary)
    monkeypatch.setattr(soilgrids,"fetch",secondary)
    field=validate_field(FIELD)
    result=analysis.analyze(field,["ph"],progress=progress)
    assert events[0]["type"]=="start" and len(events[0]["tasks"])==2
    assert [e["source"] for e in events if e["type"]=="property"]==["SoilGrids","iSDAsoil"]
    # The completed JSON keeps its established provider order.
    assert [v["source"] for v in result["values"]]==["iSDAsoil","SoilGrids"]
    monkeypatch.setattr(isdasoil,"fetch",lambda *args:pytest.fail("Cached analysis fetched a provider"))
    events.clear()
    assert analysis.analyze(field,["ph"],progress=events.append)["cached"]
    assert len([e for e in events if e["type"]=="property"])==2


def test_stream_contract_keeps_failures_unavailable_and_json_compatible(monkeypatch):
    monkeypatch.setattr(isdasoil,"fetch",lambda *args:value("iSDAsoil"))
    monkeypatch.setattr(soilgrids,"fetch",lambda *args:value("SoilGrids","no_coverage"))
    client=TestClient(app)
    response=client.post("/api/soil/analyze",json={"geojson":FIELD,"properties":["ph"]},headers={"Accept":"application/x-ndjson"})
    assert response.status_code==200 and "application/x-ndjson" in response.headers["content-type"]
    events=[json.loads(line) for line in response.text.splitlines() if line]
    assert events[0]["type"]=="start" and events[-1]["type"]=="complete"
    assert any(e.get("status")=="no_coverage" for e in events)
    assert events[-1]["result"]["preferred"]=={"ph":"iSDAsoil"}
    ordinary=client.post("/api/soil/analyze",json={"geojson":FIELD,"properties":["ph"]})
    assert ordinary.json()["values"]==events[-1]["result"]["values"]
    assert client.post("/api/soil/analyze",json={"geojson":FIELD,"properties":["bad"]},headers={"Accept":"application/x-ndjson"}).status_code==422


def test_stream_errors_end_cleanly(monkeypatch):
    def fail(*args,**kwargs): raise RuntimeError("internal diagnostic should not be exposed")
    monkeypatch.setattr(analysis,"analyze",fail)
    response=TestClient(app).post("/api/soil/analyze",json={"geojson":FIELD},headers={"Accept":"application/x-ndjson"})
    events=[json.loads(line) for line in response.text.splitlines() if line]
    assert events==[{"type":"error","message":"Soil analysis could not finish. Please retry."}]


def test_closing_stream_cancels_queued_analysis(monkeypatch):
    stopped=threading.Event()
    def wait_for_cancel(*args,progress,cancelled):
        progress({"type":"start","tasks":[]})
        if cancelled.wait(3): stopped.set()
    monkeypatch.setattr(analysis,"analyze",wait_for_cancel)
    stream=analysis_events(validate_field(FIELD),AnalysisRequest(geojson=FIELD))
    assert json.loads(next(stream))["type"]=="start"
    stream.close()
    assert stopped.wait(3)
