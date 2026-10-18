from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = Path(os.environ.get("MSI_CACHE_DIR", ROOT / ".cache"))
ENABLE_FERTIMAP = os.environ.get("ENABLE_FERTIMAP", "false").lower() == "true"
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_AREA_HA = 1000
MAX_RASTER_CELLS = 60000
PROVIDER_TIMEOUT = 18
ANALYSIS_WORKERS = 4
GDAL_ENV = {
    "GDAL_HTTP_TIMEOUT": "18", "GDAL_HTTP_CONNECTTIMEOUT": "8", "GDAL_HTTP_MAX_RETRY": "0",
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.vrt,.ovr",
    "GDAL_HTTP_MULTIRANGE": "YES",
}
