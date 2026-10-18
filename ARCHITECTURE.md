# Architecture — Morocco Soil Insights

## Scope and technology

Local-only workspace with one active field and one temporary comparison snapshot. Next.js App Router + TypeScript + Tailwind v4 + customized shadcn/ui primitives + Redux Toolkit. Mapbox GL JS uses Mapbox Satellite exclusively. Three.js renders on-demand property sheets and terrain alongside the main map. No weather, AI, authentication, database, microservices, Leaflet or Esri imagery.

FastAPI endpoints delegate to explicit service functions. Rasterio/NumPy process native rasters; Shapely validates shapes; PyProj/Geod select local UTM and calculate ellipsoidal field area. The original reference repository remains unchanged.

## Directories

`frontend/app`: Next.js routes, design tokens and server proxy. `frontend/components`: dashboard, drawing/map integration, interactive property-sheet stack and optional terrain preview. `frontend/store`: serializable shared field/analysis state. Mapbox and Three.js objects live in component refs, never Redux.

The simplified interface uses icon tiles for soil, nutrients and water/terrain. Source controls and the depth selector were removed at the user's request; the API retains explicit source/depth parameters. The default preferred source is used, with its actual depth and source recorded beside the selected reading. Methods, source comparisons, uncertainty and attribution are available in Help.

After explicit field confirmation and the soil response, a lazy floating Three.js view opens five property sheets: pH, organic carbon, total nitrogen, clay and water holding. Sheets use the actual Polygon/MultiPolygon footprint (including holes), native-cell colour textures and symbolic separation, not underground depth positions. Missing map data appears grey. Layer selection updates the map without closing 3D. Pointer raycasting and accessible icon labels expose hover readings. Both stack and terrain support explicit zoom/reset and pointer rotation. Terrain retains DEM height at 1×. Scenes animate their entrance, respect reduced motion and release renderers on unmount; there is no perpetual idle render loop. Mapbox and Three.js share property palettes: warm sequential soil colours and blue water colours, never suitability scores.

`field.comparison` stores one serializable, confirmed Land A snapshot in Redux. Selecting Land B follows the original validation and explicit confirmation path; resets, uploads and edits preserve A. `lib/comparison.ts` selects common valid source/depth/unit/method pairs before subtracting B − A; incompatible or missing data has no numeric difference. Failed or unconfirmed Land B never enters the table. The map retains A's dashed boundary and provides A/B/both framing. Removing A retains the current land. Snapshots are session-only, without persistence or additional provider requests for A.

The selected-land tray lives over the map, outside the sidebar and navigation rail. Its Add another land action offers drawing or uploading; canceling before a confirmed Land B restores A. Comparison offers readings or two lazy Three.js stacks. Each stack fits its own footprint, shows its area, and uses the same selected property and catalogue colour domain. Native map cells for A and B render through independent map sources with shared-cache reads, using compatible measurement pairs where available. Hidden 3D comparison scenes unmount. A separate label column keeps layer badges away from both canvases. Initial map framing targets Morocco; no country mask, maximum bounds or minimum zoom restriction is installed.

`backend/main.py`: thin endpoints and bounded request bodies. `backend/core`: configuration, geometry validation, atomic local cache. `backend/services`: explicit provider adapters, catalogue, normalized analysis and terrain derivatives. `backend/schemas.py`: typed response contracts. `backend/tests`: deterministic tests and saved source evidence.

## Field lifecycle

Drawing and upload converge on a single geometry. Upload accepts raw Polygon/MultiPolygon, Feature or exactly-one-feature FeatureCollection. Preserve holes; do not repair self-intersections. Enforce the 5 MB client limit and bounded API body, 10,000 vertices, 1,000 hectares and compact raster-window size.

Drawing updates preview state only. At three distinct points Confirm Field becomes enabled. Confirmation validates the geometry, commits the field and starts soil/terrain requests. Upload validation computes area and prepares the preview but does not analyze. Vertex edits, redraws and replacement uploads invalidate prior results and abort previous browser requests. Generation checks prevent late results from changing a newer field.

With an empty Mapbox token, the raster map is not initialized; uploads can validate and report area, but confirmation is disabled. The setup screen explains the environment setting and restart requirement.

## API contract

All frontend calls use the same-origin `/api` proxy. `BACKEND_URL` remains server-only.

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/health` | None | Status and application name |
| `GET /api/soil/catalog` | None | Properties, units, ranges, provider/depth options, optional-provider flag |
| `POST /api/fields/validate` | `{geojson}` | Validated geometry, geodesic hectares, bounds, representative point, UTM EPSG, warnings |
| `POST /api/soil/analyze` | `{geojson, properties?, source?, depth?}` | Field, source-specific values, preferred compatible sources, issues, cached flag |
| `POST /api/terrain/analyze` | `{geojson}` | Terrain values, bounded mesh, issues |
| `GET /api/layers/{id}` | Content-addressed ID | GeoJSON native-pixel footprints clipped to the field |

Each soil result has `property`, `label`, `value|null`, `unit`, `source`, `depth`, `method`, `status`, `estimated`, optional `uncertainty`, `native_resolution_m`, `layer_url`, `min/max`, `coverage_pct` and `message`. Status is `ok`, `no_coverage`, `error` or `disabled`. Errors do not become zero.

`POST /api/soil/analyze` also accepts `Accept: application/x-ndjson`. It streams `start` (expected provider/property tasks), `working`, `property` (actual completion/status), then `complete` (the same validated AnalysisResponse) or `error`. The same-origin Next.js proxy forwards this Accept header and streams the response body without buffering. Ordinary JSON callers remain compatible. Provider futures report in completion order while the final values retain their established order. Cached responses report their actual completed tasks immediately.

During confirmation, a dialog centred over the map shows boundary validation, pH, carbon, nitrogen, composition, nutrients, water, terrain and 3D-layer preparation. Percentages count completed provider tasks plus boundary/terrain/preparation, not elapsed time; failed work is marked unavailable or partial. The five sheet layers are fetched into a shared bounded cache before opening 3D. Cancellation aborts the frontend requests, signals the streaming producer to skip queued work and preserves the field for reconfirmation. Already-running provider reads retain their existing network timeouts. Field generation guards prevent late results from opening an old field.

Depth-specific analysis requires an explicit source. iSDAsoil uses its metadata's native band names (usually 0–20/20–50 cm, bedrock separately); SoilGrids uses its native standard intervals, with carbon stock at 0–30 cm. Results can be revisited without downloading the same layer again.

## Data policy and rendering

The default is iSDAsoil. Automatic fallback requires matching property, unit, depth and analytical method. Different pH definitions, native depth intervals and effective/buffered CEC remain separate. Supplementary properties with no iSDA definition use SoilGrids directly. Users can inspect available comparison estimates in Help even when their definitions are not suitable for automatic fallback. No blending or generated accuracy score.

Only allow-listed metadata transforms are decoded; remote formulas are never evaluated. No-data masks are retained. iSDA log-space standard deviations stay labelled in encoded units; they are not falsely converted to physical-unit error bars. SoilGrids pH quantiles are means of pixel bounds, not a calibrated field confidence interval.

**Verified nitrogen exception:** iSDAsoil's AWS JSON lists `expm1(x/10)` for total nitrogen, which yielded an impossible value above 1,000 g/kg at the live test field. The [original dataset publication by its creators](https://zenodo.org/records/4090386) and [Earth Engine catalogue](https://developers.google.com/earth-engine/datasets/catalog/ISDASOIL_Africa_v1_nitrogen_total) both specify **`expm1(x/100)` in g/kg**. The nitrogen adapter uses that explicit documented conversion. A regression test preserves the conflicting metadata and checks the corrected decoded result. Other properties retain their own declared transforms. The recorded earlier benchmark is raw evidence, not a guarantee that every old decoded value was correctly interpreted.

Window reads use native grids. Each valid cell is converted to a polygon, clipped to the field and displayed as a Mapbox fill layer. Field summaries use clipped-cell geographic area weights. Large rasters are bounded rather than interpolated into invented detail. Terrain derivatives use a halo, exclude invalid neighbouring pixels, and use a circular mean for aspect; flat areas have no meaningful aspect.

## Reliability and configuration

`instrumentation-client.ts` runs synchronous pre-hydration cleanup for the specific browser-extension attribute families present in the reported error (`bis_*`, `cz-shortcut-listen`, selected `rtrvr-*` flags and UUID-shaped `__processed_*__` markers). It does not remove application attributes or suppress React hydration diagnostics. A short-lived observer covers the initial hydration interval, disconnects on the dashboard's first commit and has a timeout fallback. Regression tests inject the captured markers into SSR HTML and separately verify that an actual class mismatch still reports an error. Help has one entry point in the field sidebar; the top-bar wordmark is a home link.

Four globally bounded provider workers prevent uncontrolled parallelism. Provider HTTP and GDAL requests have explicit timeouts. Atomic content-addressed JSON files cache metadata, successful provider results, complete analyses and native-cell layers. Cache keys include normalized validated geometry, source, property, depth and schema version. Failures are not cached as successful results. Soil and terrain failures are independent.

`frontend/.env.local` contains an empty `NEXT_PUBLIC_MAPBOX_TOKEN` and the local `BACKEND_URL`; Git ignores the file. Mapbox's public token is browser-visible by design, so restrict it appropriately; never place a secret there. Both soil raster routes work without provider credentials. Fertimap is off unless explicitly enabled by an informed operator after permissions are established.

No country-border claim is enforced by the approximate Morocco viewport warning; geometry coordinates are globally validated. The MVP is optimized for Moroccan fields. It performs no claim of real-time conditions or lab accuracy.

## Design and motion

Semantic forest `#2F5430`, sage `#F2F6EC`, off-white `#FBFCF4`, muted ink, restrained dividers and no box shadows. Desktop navigation rail and compact sidebar; mobile map above a responsive analysis sheet. System typography avoids an external font dependency. Keyboard focus, readable field states, labelled inputs and reduced-motion handling are provided.

Ordinary interactions use Mapbox camera easing and CSS. The lazy Three.js mesh renders on resize/interaction only, disposes geometry/materials/renderer on unmount, and respects reduced motion. No separate globe or continuously running hidden GPU scene.

## Validation boundaries

Backend tests cover input wrappers, holes/MultiPolygon, invalid boundaries, Morocco UTM zones, recorded raster decoding, missing values, clipping, provider failure, cache reuse, compatible fallback, body limits and slope/aspect.

Playwright uses real FastAPI validation. It separately tests the production empty-token page and a dev-only map event adapter. Live Mapbox imagery, token authorization and Mapbox camera behavior cannot be verified while the token is empty; no claim is made that the test adapter proves those integrations. Live source smoke tests are recorded independently.
