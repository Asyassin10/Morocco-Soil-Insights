# Verification record

Verified locally on **17 October 2026**, using Python 3.11.4, Node 22.14 and the frontend lockfile.

| Check | Result |
|---|---|
| Python backend tests | **25 passed** |
| TypeScript check | **Passed** |
| Next.js production build | **Passed** |
| Playwright browser flows | **22 passed** |
| Empty-token Mapbox network check | **No Mapbox requests** |
| Desktop/mobile layout | **No horizontal overflow or page errors** at 1440×1000 and 390×844 |
| Local launcher and same-origin proxy | **Passed**; selected an unused backend port and validated an upload |
| Live full Meknes soil analysis | **28 source-specific results**, all `ok`, no provider issues |
| Live terrain | Elevation, slope and aspect returned; generated layers accessible |
| Reference repository tracked files | No changes |
| Mapbox token file | User-provided public token configured locally and ignored by Git |
| Real Mapbox Satellite | Imagery rendered with the user's token; zoom controls verified |

The current browser suite uses separate empty-token and deterministic map-adapter dev servers with isolated build directories. It tests real backend geometry validation, explicit confirmation, Undo/Cancel, edited boundaries, invalid/oversized uploads, drag-and-drop, stale request cancellation, five-sheet selection, Help and lazy Three.js stack/terrain disposal. It also covers two independent field confirmations, preserving/removing Land A, common-source matching, incompatible depths/methods, missing versus zero values, 3D hover details, selection while open, map tilt and mobile comparison. The map-tray update adds tests for unrestricted Morocco initial framing, absent map badge/sidebar comparison controls, label/canvas spacing, two simultaneous 3D views, shared selection, hidden-scene disposal and restoring A when B selection is canceled. Provider outages are simulated rather than relying on live failures. The production build is checked separately.

The floating UI was checked against live Mapbox Satellite and cached real-provider results for the synthetic Meknes field at 1440×1000 and 390×844. The stack remains alongside the map, selecting pH updates the warm native-cell map, hover changes the property explanation, and the map has no horizontal overflow or page errors. Evidence: `screens/floating-layers-live.png`, `screens/floating-layers-hover-live.png`, `screens/floating-layers-live-mobile.png`, `screens/warm-ph-map-live.png`. Two-field table evidence uses deterministic test responses: `screens/land-comparison-desktop.png` and `screens/land-comparison-mobile.png`; these screenshots are UI tests, not additional live agronomic measurements.

The subsequent map-tray revision was checked with live Mapbox Satellite and real cached provider outputs for the synthetic Meknes and Taza benchmark fields. The start view has no Morocco badge or country mask, and land selection/comparison stays outside the sidebar. Both 3D footprints rendered together, their selected soil readings matched the retained field results, and focusing A showed its native-cell overlay. Desktop and mobile runs reported no page errors or horizontal overflow. Evidence: `screens/unrestricted-morocco-start.png`, `screens/map-tray-spaced-layers-live.png`, `screens/map-tray-spaced-layers-mobile.png`, `screens/compare-3d-live.png`, `screens/compare-3d-live-mobile.png`. Layer badges now occupy a separate column; the mobile layout also reserves space between the floating panel and map legend.

The hydration regression tests inject the reported browser-extension markers into the server HTML, then verify that hydration completes without mismatch errors and the single sidebar Help control opens on desktop/mobile. A separate negative test injects an application class mismatch and deliberately expects React's error, proving diagnostics remain enabled. The temporary cleanup observer stops after hydration. The same extension-marker replay passed against the running application on port 3000 with zero hydration/page errors, one Help button and no top-bar Help button. Evidence: `screens/sidebar-help-desktop.png`, `screens/sidebar-help-mobile.png`. Crop comparison without AI is documented as a proposal in `CROP_COMPARISON_PLAN.md`; it is not implemented in this fix.

Real Mapbox Satellite imagery and zoom controls were subsequently verified in the in-app browser at localhost:3005 with the user's public token. Evidence: `screens/live-mapbox.png`. Development adapter builds now use a separate `.next-e2e` directory to prevent cached test modules from appearing in the normal app. Full real-map drawing/editing flows and deployment-domain token restrictions remain unverified.

The simplified interface was then verified at localhost:3000 with live Meknes data: five property sheets rendered actual field-cell textures, clicking the 3D canvas selected organic carbon, clicking the confirmed field reopened 3D, and the DEM terrain tab rendered. Desktop and 390×844 mobile checks showed no browser errors or horizontal overflow. Sources, uncertainty and comparisons are in Help. Evidence: `screens/soil-stack-desktop.png` and `screens/soil-stack-mobile.png`. All **13 updated browser tests passed**; TypeScript and the production build passed.

Live analysis progress was subsequently checked through the Next.js proxy using an uncached synthetic Taza field. The map dialog progressed from active provider reads to pH/carbon/nitrogen marked Done at 74%, and water marked Done at 90%. This used real backend events, not timers. Desktop and 390×844 mobile evidence: `screens/analysis-progress.png`, `screens/analysis-progress-mobile.png`. The expanded suite passed **25 Python tests and 15 browser tests**, covering completion ordering, cached progress, JSON compatibility, unavailable values, cancellation, interrupted streams and late-result rejection.

Live evidence: `live-full-analysis.json`, `live-smoke-results.json`. The observed iSDAsoil nitrogen value is approximately **1.01 g/kg**, using the original dataset publication's `/100` log conversion; the incorrect AWS JSON conversion is covered by a regression test. These figures are predictions, not field measurements.

Screenshots: `screens/desktop.png` and `screens/mobile.png` show the actual empty-token application. The contour illustration is a clearly labelled setup backdrop, not a satellite image or claimed soil data.

Python emitted dependency deprecation warnings from Starlette/Shapely/Rasterio; no test failures. Live service availability can change after verification. No deployment was performed and no account or token was created.
