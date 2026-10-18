"""Content-addressed JSON cache, adapted from the reference project's disk cache."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time

from .config import CACHE_DIR


def cache_key(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def get(key: str, ttl: int = 86400):
    path = CACHE_DIR / f"{key}.json"
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
        return record["value"] if time.time() - record["stored"] < ttl else None
    except (OSError, ValueError, KeyError):
        return None


def put(key: str, value):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"stored": time.time(), "value": value}, allow_nan=False)
    fd, name = tempfile.mkstemp(dir=CACHE_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
        os.replace(name, CACHE_DIR / f"{key}.json")
    finally:
        Path(name).unlink(missing_ok=True)
    return value


def get_layer(layer_id: str):
    if not layer_id or len(layer_id) != 64 or any(c not in "0123456789abcdef" for c in layer_id):
        return None
    return get(layer_id, ttl=30 * 86400)
