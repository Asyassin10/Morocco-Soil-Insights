# Morocco Soil Insights

**Demo:** [Watch on YouTube](https://www.youtube.com/watch?v=FB_0ssN-jhc)

Morocco Soil Insights lets you explore predicted soil properties for a selected field. Draw a boundary or upload a GeoJSON, confirm it, and view soil layers, terrain, and a comparison with a second field.

## Screenshots

These screenshots show the main field analysis and comparison views.

### Soil layers and 3D view

![A selected field with soil property cards and a 3D soil-layer stack](docs/screenshots/soil-layers-and-3d.png)

### Draw a field boundary

![Drawing and confirming a field boundary on the satellite map](docs/screenshots/draw-field-boundary.png)

### Compare soil readings

![Side-by-side soil property values for two selected fields](docs/screenshots/compare-soil-readings.png)

### Compare fields in 3D

![Two selected fields with their soil layers shown in side-by-side 3D views](docs/screenshots/compare-fields-3d.png)

## What it uses

### Application stack

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS, Redux Toolkit
- **Maps and 3D:** Mapbox GL JS and Mapbox Satellite; Three.js for the optional 3D soil view
- **Backend:** FastAPI (Python)
- **Geospatial processing:** Rasterio, NumPy, Shapely, and PyProj
- **Requests and caching:** HTTPX and a local file cache

### External data and APIs

| Source | Role in this app | API and data links |
|---|---|---|
| **iSDAsoil** | Primary soil properties and nutrient predictions, usually at 0–20 cm and 20–50 cm | The app reads public [AWS-hosted COG rasters and metadata](https://www.isda-africa.com/isdasoil/isdasoil-on-aws/), for example [pH metadata](https://isdasoil.s3.amazonaws.com/soil_data/ph/ph.json). It does **not** call iSDAsoil’s separate [authenticated point API](https://www.isda-africa.com/isdasoil/developer/). |
| **SoilGrids (ISRIC)** | Additional properties and comparison values at native depths; used as fallback only when the property and method are compatible | Public [VRT raster files](https://files.isric.org/soilgrids/latest/data/) and the [WCS service](https://maps.isric.org/mapserv) for water-retention TIFFs. See ISRIC’s [VRT access guide](https://docs.isric.org/globaldata/soilgrids/WebDav.html) and [WCS API guide](https://docs.isric.org/globaldata/soilgrids/wcs.html). |
| **Copernicus DEM GLO-30** | Elevation, slope, aspect, and the terrain preview | Public [GLO-30 COG tiles on AWS](https://copernicus-dem-30m.s3.amazonaws.com/) and the [dataset documentation](https://registry.opendata.aws/copernicus-dem/). |
| **Mapbox** | Satellite basemap and map controls | [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/overview/) with a [public access token](https://docs.mapbox.com/help/getting-started/access-tokens/). |
| **Fertimap (optional)** | Point-based comparisons for selected soil and fertility fields | Disabled by default. The adapter uses a [legacy endpoint](http://www.fertimap.ma/php/detail.inc.php); public API documentation and reuse terms have not been confirmed. Do not enable it until those terms are checked. |

The app’s own backend API is documented at `http://127.0.0.1:8010/docs` when running locally. It provides `GET /api/health` and `/api/soil/catalog`, `POST /api/fields/validate`, `/api/soil/analyze`, `/api/terrain/analyze`, and `GET /api/layers/{id}`. The Next.js server proxies browser requests to FastAPI through same-origin `/api/...` routes.

Soil values are map predictions, not lab measurements. Sources use different resolutions, depths, and measurement methods; the app keeps these distinctions visible and does not treat missing data as zero.

## V2 roadmap

Possible next improvements, in priority order:

1. **Arabic and French interface:** translate the field workflow, layer names, units, and help text.
2. **Field reports:** export a clear PDF summary and the validated GeoJSON with sources, depths, and limitations included.
3. **Stronger land comparisons:** make source/depth matching and data coverage easier to understand, and show unavailable comparisons plainly.
4. **Morocco-specific crop guidance:** add only after finding reliable local crop requirements and suitable climate data; present results as guidance with sources, not as a guarantee or prescription.

These are proposed V2 ideas, not features currently in the app.

## Run locally on Windows

Requires **Python 3.11+** and **Node.js 22+**. From the project folder, install dependencies:

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

Add your Mapbox public token to `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_MAPBOX_TOKEN=your_public_token
BACKEND_URL=http://127.0.0.1:8010
```

Keep the token public and restricted. Restart Next.js after changing `.env.local`.

Open two PowerShell terminals in the project folder. Start FastAPI in the first:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8010
```

Start Next.js in the second:

```powershell
cd frontend
npm run dev -- --port 3000
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). FastAPI’s interactive API documentation is at [http://127.0.0.1:8010/docs](http://127.0.0.1:8010/docs). Keep both terminals running while using the app.

## Field files

Upload one GeoJSON `Polygon` or `MultiPolygon`, a `Feature` containing one, or a `FeatureCollection` with exactly one polygon feature. Files are limited to 5 MB. The app checks coordinates and geometry, then waits for **Confirm Field** before requesting soil data.

## Checks and project details

Run backend tests from the project folder:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -q
```

Run frontend checks from `frontend`:

```powershell
npm run typecheck
npm run build
```

For source limitations, attribution, and implementation details, see [ARCHITECTURE.md](ARCHITECTURE.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). A [project demo](docs/demo/morocco-soil-insights-demo.mp4) is also available.
