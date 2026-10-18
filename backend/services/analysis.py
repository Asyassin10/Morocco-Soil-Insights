from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from ..core import cache
from ..core.config import ANALYSIS_WORKERS
from . import isdasoil, soilgrids, fertimap
from .catalog import PROPERTIES, equivalent

_slots = threading.BoundedSemaphore(ANALYSIS_WORKERS)


def preferred_sources(values):
    preferred = {}
    for key in {v["property"] for v in values}:
        candidates = [v for v in values if v["property"] == key]
        primary = next((v for v in candidates if v["source"] == "iSDAsoil"), None)
        if primary is not None:
            if primary["status"] == "ok":
                preferred[key] = "iSDAsoil"
            else:
                fallback = next((v for v in candidates if v["status"] == "ok" and equivalent(primary, v)), None)
                if fallback:
                    preferred[key] = fallback["source"]
        else:
            valid = next((v for v in candidates if v["status"] == "ok"), None)
            if valid:
                preferred[key] = valid["source"]
    return preferred


def analyze(field, properties=None, source=None, depth=None, progress=None, cancelled=None):
    properties = properties or list(PROPERTIES)
    key = cache.cache_key("analysis-v3", field["geometry"], properties, source, depth)
    jobs = []
    for prop in properties:
        spec = PROPERTIES[prop]
        for name, module, available in [("iSDAsoil", isdasoil, spec[3]), ("SoilGrids", soilgrids, spec[4])]:
            if available and (source is None or source == name):
                jobs.append((name,module,prop))

    if progress:
        progress({"type":"start","tasks":[{"source":name,"property":prop} for name,_,prop in jobs]})
    hit = cache.get(key)
    if hit:
        if progress:
            for value in hit["values"]:
                progress({"type":"property","source":value["source"],"property":value["property"],"status":value["status"]})
        return {**hit, "cached": True}

    def run(job):
        name,module,prop = job
        if cancelled and cancelled.is_set():
            return None
        item_key = cache.cache_key("provider-v3", name, prop, depth, field["geometry"])
        hit = cache.get(item_key, ttl=7*86400)
        if hit:
            return hit
        try:
            with _slots:
                if cancelled and cancelled.is_set():
                    return None
                if progress:
                    progress({"type":"working","source":name,"property":prop})
                value = module.fetch(field, prop, depth)
            if value["status"] == "ok":
                cache.put(item_key, value)
            return value
        except Exception as exc:
            spec = PROPERTIES[prop]
            return {"property":prop,"label":spec[0],"unit":spec[1],"source":name,"depth":depth or ("0-20 cm" if name=="iSDAsoil" else "0-5 cm"),
                    "method":"Provider unavailable","status":"error","estimated":True,"value":None,
                    "message":f"{name} could not return this property ({type(exc).__name__}). Please retry later."}
    values = [None] * len(jobs)
    with ThreadPoolExecutor(max_workers=ANALYSIS_WORKERS) as pool:
        futures = {pool.submit(run,job):i for i,job in enumerate(jobs)}
        for future in as_completed(futures):
            value = future.result()
            if value is None:
                continue
            values[futures[future]] = value
            if progress and not (cancelled and cancelled.is_set()):
                progress({"type":"property","source":value["source"],"property":value["property"],"status":value["status"]})
    if cancelled and cancelled.is_set():
        return None
    values = [v for v in values if v is not None]
    issues = sorted({v["message"] for v in values if v["status"] == "error"})
    try:
        values += fertimap.fetch(field)
    except Exception:
        issues.append("Optional Fertimap comparison is currently unavailable.")
    payload = {"field":field,"values":values,"preferred":preferred_sources(values),"issues":issues,"cached":False}
    # Cache only fully successful retrievals; service errors must not become sticky results.
    if not issues:
        cache.put(key,payload)
    return payload
