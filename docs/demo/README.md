# Morocco Soil Insights demo

`morocco-soil-insights-demo.mp4` is a two-minute, 1080p recording of the running app. It has an original instrumental soundtrack, visible cursor and click indicators, no voiceover, and no added chapter captions. It follows the real interface in order: upload and confirm two nearby square fields, inspect soil and terrain readings, compare them on the tilted satellite map, then rotate and zoom the paired 3D soil stacks and select several layers.

The original coordinate snippet supplied for the demo had only three vertices and did not contain a complete field boundary. To make the comparison easy to read, the two repeatable test fields are equal 400 m by 400 m squares near that location. Each validates at 15.95 ha. The video demonstrates the app on these new square test fields; it does not claim to analyze the unfinished original polygon.

Both fields completed the live API flow: 28 soil properties per field, plus Copernicus terrain results, with no provider issues. iSDAsoil pH is 6.30 for A and 6.45 for B at 0–20 cm. SoilGrids also returned pH at its native 0–5 cm depth (7.52 and 7.43). These source and depth estimates remain separate. Full responses are saved in `live-demo-api-results.json`; the Playwright run details and browser/API error list are in `playwright-demo-results.json`.

`demo-comparison-final.png` is a frame from the final paired 3D view. `soundtrack.wav` is the original, non-vocal background music used in the MP4. The two test geometries are `land-a-square.geojson` and `land-b-square.geojson`.

To repeat the live browser capture, start FastAPI on port 8010 and Next.js on port 3000, then run this from `frontend`:

```powershell
npm run demo:record
```

That command recreates the raw Playwright WebM and updates `playwright-demo-results.json`. The MP4 is encoded from that capture with `ffmpeg` and the included soundtrack.
