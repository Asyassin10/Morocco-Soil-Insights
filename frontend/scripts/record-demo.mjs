import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..","..");
const out=path.join(root,"docs","demo");
const errors=[];
const result={startedAt:new Date().toISOString(),app:process.env.MSI_DEMO_URL||"http://127.0.0.1:3000",fields:{},actions:[],browserErrors:errors};
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader"]});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,recordVideo:{dir:out,size:{width:1920,height:1080}}});
const page=await context.newPage();
page.on("pageerror",e=>errors.push(`pageerror: ${e.message}`));
page.on("console",m=>{if(m.type()==="error"&&!m.text().toLowerCase().includes("mapbox"))errors.push(`console: ${m.text()}`)});
page.on("response",r=>{if(r.url().includes("/api/")&&r.status()>=400)errors.push(`API ${r.status()}: ${r.url()}`)});
await page.addInitScript(()=>{
  const add=()=>{
    if(document.querySelector("#demo-cursor"))return;
    const dot=document.createElement("div");dot.id="demo-cursor";
    Object.assign(dot.style,{position:"fixed",left:"0",top:"0",width:"15px",height:"15px",borderRadius:"50%",background:"#f6a43a",border:"2px solid #fff9e9",boxShadow:"0 1px 8px #231a12aa",zIndex:"2147483647",pointerEvents:"none",transform:"translate(-50%,-50%)",transition:"left 45ms linear,top 45ms linear",opacity:"0"});
    document.body.appendChild(dot);
    document.addEventListener("pointermove",e=>{dot.style.left=`${e.clientX}px`;dot.style.top=`${e.clientY}px`;dot.style.opacity="1";},{passive:true});
    document.addEventListener("pointerdown",e=>{const ring=document.createElement("div");Object.assign(ring.style,{position:"fixed",left:`${e.clientX}px`,top:`${e.clientY}px`,width:"18px",height:"18px",border:"2px solid #ffcf71",borderRadius:"50%",transform:"translate(-50%,-50%) scale(.65)",zIndex:"2147483646",pointerEvents:"none",transition:"transform .36s ease-out,opacity .36s"});document.body.appendChild(ring);requestAnimationFrame(()=>{ring.style.transform="translate(-50%,-50%) scale(2.3)";ring.style.opacity="0"});setTimeout(()=>ring.remove(),400);},{passive:true});
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",add,{once:true});else add();
});
const start=Date.now();
async function hold(ms){await page.waitForTimeout(ms)}
async function chooseFile(button,filename){const [chooser]=await Promise.all([page.waitForEvent("filechooser"),button.click()]);await chooser.setFiles(path.join(out,filename));await page.getByText(filename,{exact:true}).waitFor({state:"visible",timeout:15000})}
async function analyze(filename){
  await page.getByRole("button",{name:"Confirm Field",exact:true}).waitFor({state:"visible",timeout:15000});
  await hold(1200);
  await page.getByRole("button",{name:"Confirm Field",exact:true}).click();
  const done=page.getByRole("dialog",{name:"Analysing your field"}).waitFor({state:"detached",timeout:180000});
  await hold(700);await done;
  const side=await page.locator(".sidebar").innerText();
  const ph=side.match(/Soil pH[\s\S]{0,85}/)?.[0]||"pH summary not found";
  result.fields[filename]={analyzed:true,pHsummary:ph.replace(/\s+/g," ").slice(0,100),soilShown:/\d+\.\d+/.test(side),hasAnalysisError:Boolean(await page.locator(".error-note").count())};
}
try{
  await page.goto(process.env.MSI_DEMO_URL||"http://127.0.0.1:3000",{waitUntil:"domcontentloaded",timeout:90000});
  await page.getByRole("button",{name:"Draw Field",exact:true}).waitFor({state:"visible",timeout:45000});
  await page.waitForFunction(()=>document.querySelector(".mapboxgl-canvas")?.getBoundingClientRect().width>500,null,{timeout:60000});
  await hold(5200);result.actions.push("Opened the live satellite map and let the field workspace settle.");

  await chooseFile(page.getByRole("button",{name:"Upload GeoJSON",exact:true}),"land-a-square.geojson");
  await hold(1800);await analyze("land-a-square.geojson");
  result.actions.push("Uploaded and confirmed square Land A; real soil and terrain analysis completed.");
  await hold(4200);
  const sidebar=page.getByRole("complementary",{name:"Field analysis"});
  await sidebar.getByRole("button",{name:/Soil pH/}).first().click();await hold(4200);
  await sidebar.getByRole("tab",{name:"Nutrients"}).click();await hold(900);
  await sidebar.getByRole("button",{name:/Phosphorus/}).click();await hold(4700);
  await sidebar.getByRole("tab",{name:"Water & terrain"}).click();await hold(900);
  await sidebar.getByRole("button",{name:/Elevation/}).click();await hold(4200);
  result.actions.push("Clicked through pH, nutrients, water and terrain readings in the live sidebar.");

  await page.getByRole("button",{name:"Add another land",exact:true}).click();await hold(600);
  await page.getByRole("button",{name:"Upload file",exact:true}).waitFor({state:"visible"});
  await chooseFile(page.getByRole("button",{name:"Upload file",exact:true}),"land-b-square.geojson");
  await hold(1800);await analyze("land-b-square.geojson");
  result.actions.push("Uploaded and confirmed adjacent square Land B; real soil and terrain analysis completed.");
  await hold(3600);

  const dock=page.getByRole("region",{name:"Selected lands"});
  await dock.getByRole("button",{name:"Fit both",exact:true}).click();await hold(1800);
  await page.getByRole("button",{name:"Tilt map",exact:true}).click();await hold(5000);
  if(await page.getByRole("button",{name:"Tilt map",exact:true}).getAttribute("aria-pressed")!=="true")throw new Error("Map tilt did not activate.");
  result.actions.push("Fitted both squares in the satellite map and tilted the map.");

  await dock.getByRole("button",{name:"Compare readings",exact:true}).click();
  const comparison=page.getByRole("region",{name:"Land comparison"});await comparison.waitFor({state:"visible"});await hold(8500);
  await comparison.getByRole("button",{name:"3D layers"}).click();
  result.actions.push("Opened the side-by-side soil reading comparison, then switched into the paired 3D views.");
  const a=page.getByRole("region",{name:"Land A 3D",exact:true}),b=page.getByRole("region",{name:"Land B 3D",exact:true});
  await a.locator("canvas").waitFor({state:"visible",timeout:90000});await b.locator("canvas").waitFor({state:"visible",timeout:90000});await hold(6500);
  for(const panel of [a,b]){
    const canvas=panel.locator("canvas"),box=await canvas.boundingBox();
    if(box){await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);await hold(600);await page.mouse.down();await page.mouse.move(box.x+box.width*.67,box.y+box.height*.40,{steps:28});await hold(350);await page.mouse.up();await hold(900)}
    await panel.getByRole("button",{name:"Zoom in 3D layers",exact:true}).click();await hold(800);
  }
  result.actions.push("Dragged to rotate and clicked zoom on each interactive 3D field stack.");
  for(const [name,wait] of [["Select Soil pH layer",4200],["Select Clay layer",4200],["Select Organic carbon layer",4200],["Select Water holding layer",4200]]){
    await a.getByRole("button",{name,exact:true}).click();await hold(wait);
    await a.getByRole("button",{name,exact:true}).hover();await hold(1200);
  }
  result.actions.push("Selected pH, clay, organic carbon, and water-holding layers, then paused on their 3D details.");
  await page.screenshot({path:path.join(out,"demo-comparison-final.png")});
  const remaining=Math.max(0,120000-(Date.now()-start));
  if(remaining)await hold(remaining);
  result.durationSeconds=Number(((Date.now()-start)/1000).toFixed(1));
}catch(e){result.failure=String(e?.stack||e);try{await page.screenshot({path:path.join(out,"demo-failure.png")})}catch{}}
finally{result.finishedAt=new Date().toISOString();result.result=result.failure?"failed":errors.length?"completed-with-browser-errors":"passed";await fs.writeFile(path.join(out,"playwright-demo-results.json"),JSON.stringify(result,null,2)+"\n");await context.close();await browser.close()}
console.log(JSON.stringify(result,null,2));if(result.failure)process.exitCode=1;
