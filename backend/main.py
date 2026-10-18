import json
import time
import queue
import threading
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from .schemas import FieldRequest, AnalysisRequest, AnalysisResponse
from .core.geo import validate_field
from .core.config import MAX_FILE_BYTES, ENABLE_FERTIMAP
from .core import cache
from .services.catalog import catalog, PROPERTIES
from .services import analysis, terrain

app = FastAPI(title="Morocco Soil Insights", version="1.0.0")


@app.middleware("http")
async def limit_body(request: Request, call_next):
    if request.method == "POST":
        length = request.headers.get("content-length")
        if length and (not length.isdigit() or int(length)>MAX_FILE_BYTES+10000):
            return JSONResponse({"detail":"File/request exceeds the 5 MB limit."},status_code=413)
        data=bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data)>MAX_FILE_BYTES+10000:
                return JSONResponse({"detail":"File/request exceeds the 5 MB limit."},status_code=413)
        # Starlette's cached body is replayed to downstream Pydantic parsing.
        request._body=bytes(data)
    return await call_next(request)


def field_or_error(geojson):
    try:
        return validate_field(geojson)
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(422,str(exc)) from exc


@app.get("/api/health")
def health():
    return {"status":"ok","application":"Morocco Soil Insights"}


@app.get("/api/soil/catalog")
def soil_catalog():
    return {"properties":catalog(),"sources":["iSDAsoil","SoilGrids"],"fertimap_enabled":ENABLE_FERTIMAP,
            "soilgrids_depths":["0-5cm","5-15cm","15-30cm","30-60cm","60-100cm","100-200cm"],
            "isdasoil_depths":["0-20","20-50"]}


@app.post("/api/fields/validate")
def validate(req: FieldRequest):
    return field_or_error(req.geojson)


@app.post("/api/soil/analyze",response_model=AnalysisResponse)
def analyze(req: AnalysisRequest, request: Request):
    field=field_or_error(req.geojson)
    if req.properties is not None and (not req.properties or any(p not in PROPERTIES for p in req.properties)):
        raise HTTPException(422,"Choose one or more properties from the soil catalogue.")
    if req.depth and not req.source:
        raise HTTPException(422,"Choose a source when requesting a specific depth.")
    allowed_depths = {"iSDAsoil": {"0-20","20-50","0-200"}, "SoilGrids": {"0-5cm","5-15cm","15-30cm","30-60cm","60-100cm","100-200cm","0-30cm"}}
    if req.depth and req.depth not in allowed_depths.get(req.source,set()):
        raise HTTPException(422,"This depth is not supported by the selected source.")
    if "application/x-ndjson" in request.headers.get("accept", ""):
        return StreamingResponse(analysis_events(field,req),media_type="application/x-ndjson",
                                 headers={"Cache-Control":"no-store", "X-Accel-Buffering":"no"})
    return analysis.analyze(field,req.properties,req.source,req.depth)


def analysis_events(field, req):
    """Report completed provider work, without simulated timers or percentages."""
    events = queue.Queue()
    cancelled = threading.Event()

    def emit(event):
        if not cancelled.is_set():
            events.put(event)

    def produce():
        try:
            result = analysis.analyze(field,req.properties,req.source,req.depth,progress=emit,cancelled=cancelled)
            if result is not None:
                result = AnalysisResponse.model_validate(result).model_dump(mode="json")
                emit({"type":"complete", "result":result})
        except Exception:
            emit({"type":"error", "message":"Soil analysis could not finish. Please retry."})

    worker = threading.Thread(target=produce,daemon=True,name="soil-progress")
    worker.start()
    try:
        while True:
            try:
                event = events.get(timeout=10)
            except queue.Empty:
                yield "\n"  # Keep the connection alive during a slow provider read.
                continue
            yield json.dumps(event,separators=(",",":"))+"\n"
            if event["type"] in ("complete","error"):
                break
    finally:
        cancelled.set()


@app.post("/api/terrain/analyze")
def analyze_terrain(req: FieldRequest):
    return terrain.analyze(field_or_error(req.geojson))


@app.get("/api/layers/{layer_id}")
def layer(layer_id: str):
    data=cache.get_layer(layer_id)
    if data is None:
        raise HTTPException(404,"Layer not found or expired. Re-analyze the field.")
    return data
