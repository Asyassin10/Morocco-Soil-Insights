import { test, expect } from "@playwright/test";
import { geometry, uploadPayload } from "./helpers";

test("empty token makes no Mapbox requests; valid upload awaits confirmation", async ({ page }) => {
  const requests: string[]=[];page.on("request",r=>requests.push(r.url()));
  await page.goto("/");
  await expect(page.getByText("Add your Mapbox token to explore")).toBeVisible();
  await expect(page.getByRole("button",{name:"Draw Field",exact:true})).toBeDisabled();
  await page.getByTestId("file-input").setInputFiles(uploadPayload());
  await expect(page.getByText("meknes.geojson",{exact:true})).toBeVisible();
  await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm Field"})).toBeDisabled();
  expect(requests.some(u=>u.includes("/soil/analyze"))).toBeFalsy();
  expect(requests.some(u=>/api\.mapbox\.com|events\.mapbox\.com/.test(u))).toBeFalsy();
});

test("upload variants validate through FastAPI", async ({ page }) => {
  await page.goto("/");
  const variants=[geometry,{type:"Feature",geometry,properties:{}},{type:"FeatureCollection",features:[{type:"Feature",geometry}]}];
  for (const value of variants) {
    await page.getByTestId("file-input").setInputFiles(uploadPayload(value));
    await expect(page.getByText(/hectares · Preview/)).toBeVisible();
  }
});

test("reject malformed, multiple-field, invalid and oversized uploads", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({name:"broken.json",mimeType:"application/json",buffer:Buffer.from("{bad")});
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toContainText("not valid JSON");
  await page.getByTestId("file-input").setInputFiles(uploadPayload({type:"FeatureCollection",features:[{type:"Feature",geometry},{type:"Feature",geometry}]}));
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toContainText("exactly one field");
  await page.getByTestId("file-input").setInputFiles(uploadPayload({type:"Point",coordinates:[-5,33]}));
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toContainText("Polygon or MultiPolygon");
  const crossed={type:"Polygon",coordinates:[[[-5.582,33.802],[-5.58,33.804],[-5.582,33.804],[-5.58,33.802],[-5.582,33.802]]]};
  await page.getByTestId("file-input").setInputFiles(uploadPayload(crossed));
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toContainText("self-intersections");
  await page.getByTestId("file-input").setInputFiles({name:"large.geojson",mimeType:"application/json",buffer:Buffer.alloc(5*1024*1024+1,32)});
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toContainText("5 MB");
});

test("drop upload works and mobile layout stays within viewport", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});await page.goto("/");
  const zone=page.getByTestId("dropzone");
  const transfer=await page.evaluateHandle(g=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(g)],"dropped.geojson",{type:"application/json"}));return dt;},geometry);
  await zone.dispatchEvent("drop",{dataTransfer:transfer});
  await expect(page.getByText("dropped.geojson",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:"test-results/mobile-empty-token.png",fullPage:true});
});

test("backend outage is explained",async({page})=>{
  await page.route("**/api/fields/validate",r=>r.fulfill({status:503,json:{detail:"The soil service is unavailable. Start the FastAPI backend and retry."}}));
  await page.goto("/");await page.getByTestId("file-input").setInputFiles(uploadPayload());
  await expect(page.getByRole("complementary",{name:"Field analysis"}).getByRole("alert")).toContainText("Start the FastAPI backend");
});

test("extension markers are removed before hydration and Help exists only in the sidebar",async({page})=>{
  // Fulfilled HTML is assigned a synthetic address space by Chromium. Permit the
  // local dev websocket so Next can finish its development hydration handshake.
  await page.context().grantPermissions(["local-network-access"],{origin:"http://127.0.0.1:3100"});
  const diagnostics:string[]=[];
  page.on("console",message=>{if(message.type()==="error")diagnostics.push(message.text());});
  page.on("pageerror",error=>diagnostics.push(error.message));
  await page.route("http://127.0.0.1:3100/",async route=>{
    const response=await route.fetch();
    const html=(await response.text())
      .replace(/<html\b/,'<html rtrvr-mw-ready="1" rtrvr-react="1" rtrvr-mw-busy="0" rtrvr-gl-click="1" rtrvr-gl-input="1" rtrvr-gl-keydown="1"')
      .replace(/<body\b/,'<body cz-shortcut-listen="true" __processed_8c2337b4-af7c-48c4-ac74-32869162d2e8__="true" bis_register="extension-marker"')
      .replace(/<div(?=[\s>])/g,'<div bis_skin_checked="1"');
    await route.fulfill({response,body:html});
  });
  await page.goto("/");
  const help=page.getByRole("complementary",{name:"Field analysis"}).getByRole("button",{name:"Help",exact:true});
  await help.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".topbar").getByRole("button",{name:/help/i})).toHaveCount(0);
  await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:/help/i})).toHaveCount(0);
  await expect(page.locator("[bis_skin_checked], [bis_register], [cz-shortcut-listen], [rtrvr-react]")).toHaveCount(0);
  expect(diagnostics.filter(message=>/hydration|hydrated|server rendered|didn't match/i.test(message))).toEqual([]);
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();
  // Once hydrated, browser extensions may annotate the DOM normally.
  await page.locator(".intro").evaluate(el=>el.setAttribute("bis_skin_checked","1"));
  await expect(page.locator(".intro")).toHaveAttribute("bis_skin_checked","1");
  await page.setViewportSize({width:390,height:844});await help.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("real application hydration mismatches still report diagnostics",async({page})=>{
  await page.context().grantPermissions(["local-network-access"],{origin:"http://127.0.0.1:3100"});
  const diagnostics:string[]=[];
  page.on("console",message=>{if(message.type()==="error")diagnostics.push(message.text());});
  await page.route("http://127.0.0.1:3100/",async route=>{
    const response=await route.fetch();
    const html=(await response.text()).replace('class="intro"','class="intro unexpected-server-class"');
    await route.fulfill({response,body:html});
  });
  await page.goto("/");
  await page.getByRole("complementary").getByRole("button",{name:"Help",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(diagnostics.some(message=>/hydration|hydrated|server rendered|didn't match/i.test(message))).toBeTruthy();
});
