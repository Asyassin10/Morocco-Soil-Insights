import { test, expect } from "@playwright/test";
import { mockAnalysis, uploadPayload, field, soil, geometry } from "./helpers";
import { readFileSync } from "node:fs";
import { compareProperty } from "../lib/comparison";
import type { SavedLand, SoilValue } from "../lib/types";

test.beforeEach(async({page})=>{await mockAnalysis(page);await page.goto("/");await expect(page.getByRole("button",{name:"Draw Field",exact:true})).toBeEnabled({timeout:15000});});

test("drawing enforces minimum, Undo, Cancel and explicit confirmation",async({page})=>{
  let requests=0;page.on("request",r=>{if(r.url().includes("/soil/analyze"))requests++;});
  await page.getByRole("button",{name:"Draw Field",exact:true}).click();
  const map=page.getByTestId("map-canvas");
  await map.click({position:{x:120,y:130}});await map.click({position:{x:240,y:130}});
  await expect(page.getByText("2 points",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm Field"})).toBeDisabled();
  await map.click({position:{x:240,y:250}});
  await expect(page.getByRole("button",{name:"Confirm Field"})).toBeEnabled();
  expect(requests).toBe(0);
  await page.getByRole("button",{name:"Undo Point"}).click();await expect(page.getByText("2 points",{exact:true})).toBeVisible();
  await map.click({position:{x:240,y:250}});await page.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(requests).toBe(0);await expect(page.getByTestId("dropzone")).toBeVisible();
});

test("confirmed drawn polygon is closed before analysis",async({page})=>{
  await page.getByRole("button",{name:"Draw Field",exact:true}).click();
  const map=page.getByTestId("map-canvas");
  for(const point of [{x:120,y:130},{x:240,y:130},{x:240,y:250}]) await map.click({position:point});
  const request=page.waitForRequest(r=>r.url().includes("/soil/analyze"));
  await page.getByRole("button",{name:"Confirm Field"}).click();
  const body=(await request).postDataJSON();
  expect(body.geojson.coordinates[0]).toHaveLength(4);
  expect(body.geojson.coordinates[0][0]).toEqual(body.geojson.coordinates[0][3]);
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("button",{name:/Soil pH.*6.7/})).toBeVisible();
});

test("upload waits for confirmation; five sheets open and selection reuses results",async({page})=>{
  let calls=0;page.on("request",r=>{if(r.url().includes("/soil/analyze"))calls++;});
  await page.getByTestId("file-input").setInputFiles(uploadPayload());
  await expect(page.getByText(/hectares · Preview/)).toBeVisible();expect(calls).toBe(0);
  await expect(page.getByRole("region",{name:"3D field explorer"})).toHaveCount(0);
  await page.getByRole("button",{name:"Confirm Field"}).click();
  const explorer=page.getByRole("region",{name:"3D field explorer"});
  await expect(explorer).toBeVisible();
  await expect(explorer.locator(".stack-labels button")).toHaveCount(5);
  await explorer.getByRole("button",{name:"Select Soil pH layer",exact:true}).click();
  await expect(explorer).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button",{name:/Soil pH.*6.7/})).toHaveAttribute("aria-pressed","true");
  expect(calls).toBe(1);
  await page.getByRole("button",{name:"View field in 3D"}).click();
  await expect(explorer).toBeVisible();expect(calls).toBe(1);
});

test("edit boundary invalidates results and requires reconfirmation",async({page})=>{
  let calls=0;page.on("request",r=>{if(r.url().includes("/soil/analyze"))calls++;});
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();await expect(page.getByRole("button",{name:"Edit boundary"})).toBeVisible();
  await page.getByRole("button",{name:"Edit boundary"}).click();
  await expect(page.getByRole("button",{name:"Confirm Field"})).toBeEnabled();
  await page.locator(".field-vertex").first().dispatchEvent("pointerup");
  expect(calls).toBe(1);await expect(page.getByText("Boundary awaiting validation")).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("button",{name:/Soil pH.*6.7/})).toBeVisible();expect(calls).toBe(2);
});

test("loading and error states, and stale requests cannot overwrite a new field",async({page})=>{
  await page.route("**/api/soil/analyze",async r=>{await new Promise(resolve=>setTimeout(resolve,500));await r.fulfill({status:503,json:{detail:"Provider connection unavailable."}});});
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await expect(page.getByRole("dialog",{name:"Analysing your field"})).toBeVisible();
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toContainText("Provider connection unavailable");
  await page.getByRole("button",{name:"Draw Field",exact:true}).click();
  await expect(page.getByText("Drawing field boundary")).toBeVisible();
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toHaveCount(0);
});

test("in-flight results are discarded after a replacement upload",async({page})=>{
  let release: (()=>void) | undefined;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/soil/analyze",async route=>{
    await pending;
    try {await route.fulfill({status:503,json:{detail:"Old field request failed"}});} catch { /* The request was intentionally aborted. */ }
  });
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await expect(page.getByRole("dialog",{name:"Analysing your field"})).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(uploadPayload(undefined,"replacement.geojson"));
  await expect(page.getByText("replacement.geojson",{exact:true})).toBeVisible();
  await expect(page.getByText(/hectares · Preview/)).toBeVisible();release?.();
  await expect(page.getByRole("button",{name:"Confirm Field"})).toBeEnabled();
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("dialog",{name:"Analysing your field"})).toHaveCount(0);
});

test("3D sheets and terrain mount on demand and release their canvases",async({page})=>{
  const recorded=JSON.parse(readFileSync("../docs/live-smoke-results.json","utf8"));
  await page.route("**/api/terrain/analyze",route=>route.fulfill({json:recorded.terrain.response}));
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await expect(page.locator(".stack-stage canvas")).toHaveCount(0);
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await expect(page.locator(".stack-stage canvas")).toBeVisible();
  await page.getByRole("button",{name:"Terrain",exact:true}).click();
  await expect(page.locator(".terrain-preview canvas")).toBeVisible();
  await expect(page.locator(".stack-stage canvas")).toHaveCount(0);
  await page.getByRole("button",{name:"Close 3D view"}).click();
  await expect(page.locator(".terrain-preview canvas")).toHaveCount(0);
});

test("source and uncertainty explanations stay in Help",async({page})=>{
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await expect(page.getByRole("region",{name:"3D field explorer"})).toBeVisible();
  await page.getByRole("button",{name:"Close 3D view"}).click();
  await expect(page.getByText("ACTIVE LAYER SOURCE")).toHaveCount(0);
  await expect(page.getByText("FIELD INSIGHTS",{exact:true})).toHaveCount(0);
  await page.getByRole("complementary",{name:"Field analysis"}).getByRole("button",{name:"Help",exact:true}).click();
  const help=page.getByRole("dialog");await expect(help).toBeVisible();
  await help.getByText("Data sources & attribution",{exact:true}).click();
  await expect(help.getByRole("heading",{name:"iSDAsoil · primary"})).toBeVisible();
  await help.getByText("About Soil pH",{exact:true}).click();
  await expect(help.getByText(/SoilGrids · 0-5 cm/)).toBeVisible();
});

test("live progress shows actual completed and unavailable steps; cancel discards late work",async({page})=>{
  let release:(()=>void)|undefined;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/terrain/analyze",async route=>{await pending;try{await route.fulfill({json:{field,values:[],mesh:null,issues:[]}});}catch{}});
  await page.route("**/api/soil/analyze",route=>route.fulfill({contentType:"application/x-ndjson",body:[
    {type:"start",tasks:[{source:"iSDAsoil",property:"ph"},{source:"SoilGrids",property:"ph"},{source:"iSDAsoil",property:"organic_carbon"}]},
    {type:"working",source:"iSDAsoil",property:"ph"},
    {type:"property",source:"iSDAsoil",property:"ph",status:"ok"},
    {type:"property",source:"SoilGrids",property:"ph",status:"ok"},
    {type:"property",source:"iSDAsoil",property:"organic_carbon",status:"no_coverage"},
    {type:"complete",result:{field,values:[soil("iSDAsoil",6.7,"0-20 cm"),soil("SoilGrids",7.9,"0-5 cm"),{...soil("iSDAsoil",0,"0-20 cm"),property:"organic_carbon",value:null,status:"no_coverage"}],preferred:{ph:"iSDAsoil"},issues:[],cached:false}},
  ].map(event=>JSON.stringify(event)).join("\n")+"\n"}));
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  const progress=page.getByRole("dialog",{name:"Analysing your field"});await expect(progress).toBeVisible();
  await expect(progress.locator("li").filter({hasText:"Soil pH"})).toContainText("Done");
  await expect(progress.locator("li").filter({hasText:"Organic carbon"})).toContainText("Unavailable");
  await expect(progress.locator("li").filter({hasText:"Terrain"})).toContainText("In progress");
  expect(Number(await progress.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThan(100);
  await progress.getByRole("button",{name:"Cancel analysis"}).click();release?.();
  await expect(progress).toHaveCount(0);await expect(page.getByRole("button",{name:"Confirm Field"})).toBeEnabled();
  await expect(page.getByRole("region",{name:"3D field explorer"})).toHaveCount(0);
});

test("an interrupted progress stream reports failure instead of opening incomplete results",async({page})=>{
  await page.route("**/api/soil/analyze",route=>route.fulfill({contentType:"application/x-ndjson",body:JSON.stringify({type:"start",tasks:[{property:"ph",source:"iSDAsoil"}]})+"\n"}));
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await expect(page.getByRole("complementary").getByRole("alert")).toContainText("connection ended");
  await expect(page.getByRole("dialog",{name:"Analysing your field"})).toHaveCount(0);
  await expect(page.getByRole("region",{name:"3D field explorer"})).toHaveCount(0);
});

const secondGeometry={...geometry,coordinates:geometry.coordinates.map(ring=>ring.map(([lng,lat])=>[lng+.012,lat]))};

test("two lands are confirmed separately and comparison preserves Land A",async({page})=>{
  let calls=0;
  await page.route("**/api/soil/analyze",route=>{calls++;return route.fulfill({json:{field,values:[soil("iSDAsoil",calls===1 ? 6.7 : 7.2,"0-20 cm")],preferred:{ph:"iSDAsoil"},issues:[],cached:false}});});
  await page.getByTestId("file-input").setInputFiles(uploadPayload());
  await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await page.getByRole("button",{name:"Add another land",exact:true}).click();
  await page.getByRole("button",{name:"Upload file",exact:true}).click();
  const comparison=page.getByRole("region",{name:"Land comparison"});
  await expect(page.getByRole("region",{name:"Selected lands"}).getByRole("button",{name:"Focus Land A"})).toBeVisible();
  expect(calls).toBe(1);
  await page.getByTestId("file-input").setInputFiles(uploadPayload(secondGeometry,"second.geojson"));
  await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Add Land B",exact:true})).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button",{name:"Confirm Field"}).click();
  const row=comparison.getByTestId("compare-ph");
  await expect(row).toContainText("6.7");await expect(row).toContainText("7.2");await expect(row).toContainText("+0.5");
  await expect(comparison.getByText("meknes.geojson",{exact:true})).toBeVisible();
  await expect(comparison.getByText("second.geojson",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Focus Land A",exact:true}).click();
  await page.getByRole("button",{name:"Fit both",exact:true}).click();
  expect(calls).toBe(2);
  const retained=JSON.parse((await page.getByTestId("map-canvas").getAttribute("data-comparisonfield"))!);
  expect(retained.geometry).toEqual(geometry);
  await page.screenshot({path:"../docs/screens/land-comparison-desktop.png"});
  await comparison.getByRole("button",{name:"Remove Land A",exact:true}).click();
  await expect(comparison).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("button",{name:/Soil pH.*7.2/})).toBeVisible();
});

test("comparison refuses differences across measurement definitions and retains missing values",()=>{
  const make=(values:SoilValue[]):SavedLand=>({name:"Test",field:field as SavedLand["field"],terrain:null,analysis:{field:field as SavedLand["field"],values,preferred:{ph:"iSDAsoil"},issues:[],cached:false}});
  const a=make([soil("iSDAsoil",6.7,"0-20 cm") as SoilValue]);
  const b=make([soil("SoilGrids",7.2,"0-5 cm") as SoilValue]);
  expect(compareProperty(a,b,"ph")).toMatchObject({difference:null,reason:"Different measurements"});
  expect(compareProperty(a,b,"nitrogen")).toMatchObject({difference:null,reason:"Missing data"});
  const noData=make([{...soil("iSDAsoil",0,"0-20 cm"),value:null,status:"no_coverage"} as SoilValue]);
  expect(compareProperty(a,noData,"ph").difference).toBeNull();
  const changedMethod=make([{...soil("iSDAsoil",7,"0-20 cm"),method:"pH in KCl"} as SoilValue]);
  expect(compareProperty(a,changedMethod,"ph").difference).toBeNull();
  const common=make([soil("iSDAsoil",6.7,"0-20 cm") as SoilValue,soil("SoilGrids",7,"0-5 cm") as SoilValue]);
  expect(compareProperty(common,b,"ph").difference).toBeCloseTo(.2);
  const zero=make([soil("iSDAsoil",0,"0-20 cm") as SoilValue]);
  expect(compareProperty(a,zero,"ph").difference).toBe(-6.7);
});

test("floating 3D exposes hover information, zoom, and selection without covering the map",async({page})=>{
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  const explorer=page.getByRole("region",{name:"3D field explorer"});
  await expect(explorer.locator("canvas")).toBeVisible();
  await explorer.getByRole("button",{name:"Select Organic carbon layer",exact:true}).hover();
  await expect(explorer.locator(".stack-hover-info")).toContainText("Carbon stored in soil organic material");
  await explorer.getByRole("button",{name:"Zoom in 3D layers",exact:true}).click();
  await explorer.getByRole("button",{name:"Zoom out 3D layers",exact:true}).click();
  await explorer.getByRole("button",{name:"Reset 3D layers",exact:true}).click();
  await explorer.getByRole("button",{name:"Select Soil pH layer",exact:true}).click();
  await expect(explorer).toBeVisible();
  await expect(page.getByRole("button",{name:"Tilt map",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Tilt map",exact:true}).click();
  await expect(page.getByRole("button",{name:"Tilt map",exact:true})).toHaveAttribute("aria-pressed","true");
  const map=await page.getByRole("region",{name:"Field map"}).boundingBox(), panel=await explorer.boundingBox();
  expect(panel!.width).toBeLessThan(map!.width*.7);
  const gradient=await page.locator(".legend-gradient").evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(gradient).toContain("244, 155, 55");
  const stage=await explorer.locator(".stack-stage").boundingBox(), labels=await explorer.locator(".stack-labels").boundingBox();
  expect(labels!.x-stage!.x-stage!.width).toBeGreaterThanOrEqual(20);
  await page.screenshot({path:"../docs/screens/floating-layers-desktop.png"});
});

test("floating layers and two-land comparison stay usable on mobile",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  const explorer=page.getByRole("region",{name:"3D field explorer"});
  await expect(explorer.locator("canvas")).toBeVisible();
  const panel=await explorer.boundingBox();expect(panel!.x).toBeGreaterThanOrEqual(0);expect(panel!.x+panel!.width).toBeLessThanOrEqual(390);
  const legend=await page.locator(".map-legend").boundingBox();expect(legend!.y-panel!.y-panel!.height).toBeGreaterThanOrEqual(8);
  await page.screenshot({path:"../docs/screens/floating-layers-mobile.png"});
  await page.getByRole("button",{name:"Add another land",exact:true}).click();
  await page.getByRole("button",{name:"Upload file",exact:true}).click();
  await page.getByTestId("file-input").setInputFiles(uploadPayload(secondGeometry,"second.geojson"));await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  const comparison=page.getByRole("region",{name:"Land comparison"});await expect(comparison.getByTestId("compare-ph")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await comparison.scrollIntoViewIfNeeded();
  await page.screenshot({path:"../docs/screens/land-comparison-mobile.png"});
});

test("Morocco is the starting view without country locks or a map badge",async({page})=>{
  const map=page.getByTestId("map-canvas");
  const options=JSON.parse((await map.getAttribute("data-map-options"))!);
  expect(options.maxBounds).toBeUndefined();expect(options.minZoom).toBeUndefined();
  expect(JSON.parse((await map.getAttribute("data-map-bounds"))!)).toEqual([[-17.2,20.8],[-.9,35.9]]);
  await expect(page.locator(".map-top-label")).toHaveCount(0);
  await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:/Compare/})).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("button",{name:/Compare/})).toHaveCount(0);
});

test("map tray compares both lands in 3D, shares selection, and disposes hidden scenes",async({page})=>{
  let calls=0;page.on("request",r=>{if(r.url().includes("/soil/analyze"))calls++;});
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await page.getByRole("button",{name:"Add another land",exact:true}).click();
  await page.getByRole("button",{name:"Upload file",exact:true}).click();
  await page.getByTestId("file-input").setInputFiles(uploadPayload(secondGeometry,"second.geojson"));await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await expect(page.getByRole("region",{name:"Land comparison"})).toBeVisible();
  await page.getByRole("button",{name:"Compare in 3D",exact:true}).click();
  const first=page.getByRole("region",{name:"Land A 3D",exact:true}),second=page.getByRole("region",{name:"Land B 3D",exact:true});
  await expect(first.locator("canvas")).toBeVisible();await expect(second.locator("canvas")).toBeVisible();
  await first.getByRole("button",{name:"Select Clay layer",exact:true}).click();
  await expect(second.getByRole("button",{name:"Select Clay layer",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("complementary").getByRole("button",{name:/Clay/})).toHaveAttribute("aria-pressed","true");
  expect(calls).toBe(2);
  await page.screenshot({path:"../docs/screens/compare-3d-desktop.png"});
  await page.getByRole("button",{name:"Readings",exact:true}).click();
  await expect(page.locator(".comparison-stacks canvas")).toHaveCount(0);
  await expect(page.getByTestId("compare-ph")).toBeVisible();
});

test("canceling the second-land selection restores the first land",async({page})=>{
  await page.getByTestId("file-input").setInputFiles(uploadPayload());await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await page.getByRole("button",{name:"Confirm Field"}).click();
  await page.getByRole("button",{name:"Add another land",exact:true}).click();
  await page.getByRole("button",{name:"Draw boundary",exact:true}).click();
  await expect(page.getByText("Drawing field boundary",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Cancel comparison",exact:true}).click();
  await expect(page.getByRole("complementary").getByRole("button",{name:/Soil pH.*6.7/})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add another land",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm Field"})).toHaveCount(0);
});
