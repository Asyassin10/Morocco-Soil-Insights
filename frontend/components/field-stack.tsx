"use client";
import { useEffect, useRef, useState } from "react";
import type { Position } from "geojson";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { CatalogItem, FieldInfo, SoilValue } from "@/lib/types";
import { getLayer } from "@/lib/layer-cache";
import { LAYERS, STACK_KEYS, layerPalette } from "@/lib/layers";

// Property sheets, inspired by the MIT reference app's stack interaction.
// Sheet spacing is decorative; only the field footprint and cell colours encode data.
export default function FieldStack({ field, values, ranges, activeKey, onSelect }: {
  field: FieldInfo; values: SoilValue[]; ranges: CatalogItem[]; activeKey: string; onSelect: (key: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect); select.current = onSelect;
  const [message, setMessage] = useState("Loading map pixels…");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const controls = useRef<(action: "in" | "out" | "reset") => void>(() => {});
  const valueKey = JSON.stringify(values.map(v => [v.property, v.layer_url, v.status]));
  const rangeKey = JSON.stringify(ranges.map(r => [r.id, r.range]));

  useEffect(() => {
    const abort = new AbortController();
    let disposed = false, cleanup = () => {};
    const load = async () => {
      const THREE = await import("three");
      const layers = await Promise.all(STACK_KEYS.map(async key => {
        const value = values.find(v => v.property===key);
        if (value?.status!=="ok" || !value.layer_url) return null;
        try { return await getLayer(value.layer_url, abort.signal); }
        catch { return null; }
      }));
      if (disposed || !host.current) return;
      const el = host.current;
      const [west, south, east, north] = field.bounds;
      const metresX = Math.max((east-west)*Math.cos((north+south)*Math.PI/360), 1e-8);
      const metresY = Math.max(north-south, 1e-8);
      const maxSpan = Math.max(metresX, metresY), planeW=2.6*metresX/maxSpan, planeH=2.6*metresY/maxSpan;
      const xy = (p: Position) => [(p[0]-west)/(east-west)*planeW-planeW/2, (p[1]-south)/(north-south)*planeH-planeH/2];
      const polygons = field.geometry.type==="Polygon" ? [field.geometry.coordinates] : field.geometry.coordinates;
      const shapes = polygons.map(rings => {
        const shape = new THREE.Shape(rings[0].map(p=>new THREE.Vector2(...xy(p) as [number, number])));
        for (const ring of rings.slice(1)) shape.holes.push(new THREE.Path(ring.map(p=>new THREE.Vector2(...xy(p) as [number, number]))));
        return shape;
      });
      const geometry = new THREE.ShapeGeometry(shapes);
      const positions=geometry.getAttribute("position"), uv=geometry.getAttribute("uv");
      for (let i=0;i<positions.count;i++) uv.setXY(i,positions.getX(i)/planeW+.5,positions.getY(i)/planeH+.5);
      const scene = new THREE.Scene();
      const group = new THREE.Group(); scene.add(group); group.rotation.y=-.5;
      const camera = new THREE.PerspectiveCamera(36,1,.1,100); camera.position.set(3.4,3.5,6.2); camera.lookAt(0,0,0);
      const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setClearColor(0x000000,0); el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-label","Interactive 3D soil layers");
      const meshes: InstanceType<typeof THREE.Mesh>[] = [];
      const textures: InstanceType<typeof THREE.CanvasTexture>[] = [];
      const materials: InstanceType<typeof THREE.MeshBasicMaterial>[] = [];
      const outlines: InstanceType<typeof THREE.LineSegments>[] = [];
      const slabGeometry = new THREE.ExtrudeGeometry(shapes, { depth: .045, bevelEnabled: false });
      const slabs: InstanceType<typeof THREE.Mesh>[] = [];
      const slabMaterials: InstanceType<typeof THREE.MeshBasicMaterial>[] = [];
      layers.forEach((data,index) => {
        const palette = layerPalette(STACK_KEYS[index]);
        const low=new THREE.Color(palette[0]), mid=new THREE.Color(palette[1]), high=new THREE.Color(palette[2]);
        const canvas=document.createElement("canvas"); canvas.width=640;canvas.height=640;
        const ctx=canvas.getContext("2d")!;
        ctx.fillStyle="#D9D7D0";ctx.fillRect(0,0,640,640);
        const domain=ranges.find(r=>r.id===STACK_KEYS[index])?.range || [0,100];
        for (const feature of data?.features || []) {
          const raw=feature.properties?.value;
          if (typeof raw!=="number" || !Number.isFinite(raw)) continue;
          const t=Math.max(0,Math.min(1,(raw-domain[0])/(domain[1]-domain[0] || 1)));
          const color=t<.5 ? low.clone().lerp(mid,t*2) : mid.clone().lerp(high,(t-.5)*2);
          ctx.fillStyle=`#${color.getHexString()}`;
          const polys=feature.geometry.type==="Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
          ctx.beginPath();
          for (const rings of polys) for (const ring of rings) {
            ring.forEach((p,i)=>{const x=(p[0]-west)/(east-west)*640,y=(north-p[1])/(north-south)*640;i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);});
            ctx.closePath();
          }
          ctx.fill("evenodd");
        }
        const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
        texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.LinearFilter; textures.push(texture);
        const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,opacity:0});materials.push(material);
        const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;
        mesh.userData={key:STACK_KEYS[index],target:(2-index)*.58}; group.add(mesh);meshes.push(mesh);
        const slabMaterial = new THREE.MeshBasicMaterial({color:LAYERS[STACK_KEYS[index]].color, transparent:true, opacity:0});
        slabMaterials.push(slabMaterial);
        const slab = new THREE.Mesh(slabGeometry, slabMaterial); slab.rotation.x=mesh.rotation.x;group.add(slab);slabs.push(slab);
        const edge=new THREE.EdgesGeometry(geometry);
        const outline=new THREE.LineSegments(edge,new THREE.LineBasicMaterial({color:LAYERS[STACK_KEYS[index]].color,transparent:true,opacity:.75}));
        outline.rotation.x=mesh.rotation.x;group.add(outline);outlines.push(outline);
      });
      let frame=0, hovered=-1, dragStart: {x:number;y:number}|null=null, lastX=0, lastY=0, dragged=false;
      const render=()=>renderer.render(scene,camera);
      const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();};
      const observer=new ResizeObserver(resize);observer.observe(el);resize();
      const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
      const began=performance.now();
      const animate=(now:number)=>{
        const t=reduced ? 1 : Math.min(1,(now-began)/1000), ease=1-Math.pow(1-t,3);
        meshes.forEach((mesh,i)=>{mesh.position.y=mesh.userData.target*ease;materials[i].opacity=ease;outlines[i].position.y=mesh.position.y+.002;slabs[i].position.y=mesh.position.y-.048;slabMaterials[i].opacity=.85*ease;});
        group.rotation.y=-.75+.25*ease;render();
        if(t<1) frame=requestAnimationFrame(animate);
      };
      frame=requestAnimationFrame(animate);
      const raycaster=new THREE.Raycaster();
      const hit=(e:PointerEvent)=>{const r=el.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);return raycaster.intersectObjects(meshes)[0]?.object;};
      const settle=()=>{cancelAnimationFrame(frame);meshes.forEach((mesh,i)=>{mesh.position.y=mesh.userData.target;materials[i].opacity=1;outlines[i].position.y=mesh.position.y+.002;slabs[i].position.y=mesh.position.y-.048;slabMaterials[i].opacity=.85;});};
      controls.current=action=>{settle();if(action==="reset"){camera.zoom=1;group.rotation.set(0,-.5,0);}else camera.zoom=Math.max(.6,Math.min(2.8,camera.zoom*(action==="in" ? 1.16 : 1/1.16)));camera.updateProjectionMatrix();render();};
      const down=(e:PointerEvent)=>{settle();dragStart={x:e.clientX,y:e.clientY};lastX=e.clientX;lastY=e.clientY;dragged=false;el.setPointerCapture(e.pointerId);};
      const move=(e:PointerEvent)=>{
        if(dragStart){if(Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)>5)dragged=true;group.rotation.y+=(e.clientX-lastX)*.008;group.rotation.x=Math.max(-.45,Math.min(.45,group.rotation.x+(e.clientY-lastY)*.004));lastX=e.clientX;lastY=e.clientY;render();return;}
        const target=hit(e),index=target ? meshes.indexOf(target as typeof meshes[number]) : -1;
        if(index!==hovered){hovered=index;setHoveredKey(index>=0 ? STACK_KEYS[index] : null);materials.forEach((m,i)=>m.color.set(i===index ? "#FFFFFF" : "#F1EDE6"));render();}
        el.style.cursor=target ? "pointer" : "grab";
      };
      const up=(e:PointerEvent)=>{if(dragStart && !dragged){const target=hit(e);if(target)select.current(target.userData.key);}dragStart=null;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);};
      const cancel=()=>{dragStart=null;setHoveredKey(null);};
      const wheel=(e:WheelEvent)=>{e.preventDefault();controls.current(e.deltaY<0 ? "in" : "out");};
      el.addEventListener("pointerdown",down);el.addEventListener("pointermove",move);el.addEventListener("pointerup",up);el.addEventListener("pointercancel",cancel);el.addEventListener("pointerleave",cancel);el.addEventListener("wheel",wheel,{passive:false});
      setMessage(layers.every(Boolean) ? "Drag to rotate · scroll to zoom" : "Grey = no data · drag to rotate");
      cleanup=()=>{cancelAnimationFrame(frame);controls.current=()=>{};observer.disconnect();el.removeEventListener("pointerdown",down);el.removeEventListener("pointermove",move);el.removeEventListener("pointerup",up);el.removeEventListener("pointercancel",cancel);el.removeEventListener("pointerleave",cancel);el.removeEventListener("wheel",wheel);geometry.dispose();slabGeometry.dispose();slabMaterials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());outlines.forEach(o=>{o.geometry.dispose();(o.material as InstanceType<typeof THREE.LineBasicMaterial>).dispose();});renderer.dispose();renderer.domElement.remove();};
    };
    load().catch(()=>{if(!disposed)setMessage("3D is unavailable. Choose a layer below to open its map.");});
    return()=>{disposed=true;abort.abort();cleanup();};
    // Stable data keys prevent rebuilding the scene when only the callback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[field,valueKey,rangeKey]);

  const detailKey=hoveredKey || (STACK_KEYS.includes(activeKey) ? activeKey : STACK_KEYS[0]);
  const detail=LAYERS[detailKey], Icon=detail.icon, value=values.find(v=>v.property===detailKey);
  return <div className="field-stack">
    <div className="stack-canvas-wrap"><div ref={host} className="stack-stage" />
      <div className="stack-controls"><button aria-label="Zoom in 3D layers" onClick={()=>controls.current("in")}><Plus size={15}/></button><button aria-label="Zoom out 3D layers" onClick={()=>controls.current("out")}><Minus size={15}/></button><button aria-label="Reset 3D layers" onClick={()=>controls.current("reset")}><RotateCcw size={14}/></button></div>
      <div className="stack-labels">{STACK_KEYS.map(key=>{const layer=LAYERS[key], LayerIcon=layer.icon;return <button key={key} aria-label={`Select ${layer.label} layer`} aria-pressed={activeKey===key} onMouseEnter={()=>setHoveredKey(key)} onMouseLeave={()=>setHoveredKey(null)} onFocus={()=>setHoveredKey(key)} onBlur={()=>setHoveredKey(null)} onClick={()=>select.current(key)} style={{borderColor:layer.color}}><LayerIcon size={13} style={{color:layer.color}}/><span>{layer.label}</span></button>;})}</div>
    </div>
    <div className="stack-hover-info" aria-live="polite"><span className="stack-info-icon" style={{color:detail.color}}><Icon size={22}/></span><div><strong>{detail.label}</strong><p>{detail.description}</p></div><b>{value?.status==="ok" && value.value!==null ? new Intl.NumberFormat("en",{maximumFractionDigits:2}).format(value.value) : "—"}<small>{value?.status==="ok" ? value.unit : "No data"}</small></b></div>
    <p role="status">{message}</p>
  </div>;
}
