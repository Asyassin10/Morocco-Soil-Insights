"use client";
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Terrain } from "@/lib/types";

export default function TerrainPreview({ mesh }: { mesh: NonNullable<Terrain["mesh"]> }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const controls=useRef<(action:"in"|"out"|"reset")=>void>(()=>{});
  useEffect(() => {
    let cleanup = () => {};
    let disposed = false;
    import("three").then(THREE => {
      if (!host.current || disposed) return;
      try {
        const el = host.current;
        // The DEM window includes a margin for slope derivatives. Frame only the field.
        const occupied = mesh.rows.flatMap((row,r) => row.flatMap((v,c) => v===null ? [] : [{r,c}]));
        if (!occupied.length) { setError("No terrain data for this field."); return; }
        const minR=Math.min(...occupied.map(p=>p.r)), maxR=Math.max(...occupied.map(p=>p.r));
        const minC=Math.min(...occupied.map(p=>p.c)), maxC=Math.max(...occupied.map(p=>p.c));
        const rows = mesh.rows.slice(minR,maxR+1).map(row=>row.slice(minC,maxC+1));
        const height = rows.length, width = rows[0]?.length || 0;
        if (height < 2 || width < 2) { setError("This field is too small for a terrain mesh."); return; }
        const numbers = rows.flat().filter((v): v is number => v !== null);
        if (!numbers.length) return;
        const base = Math.min(...numbers), span = Math.max((width-1)*mesh.dx, (height-1)*mesh.dy);
        const geometry = new THREE.BufferGeometry();
        const points: number[] = [], indices: number[] = [];
        rows.forEach((row,r) => row.forEach((value,c) => points.push((c-(width-1)/2)*mesh.dx, ((height-1)/2-r)*mesh.dy, (value ?? base)-base)));
        for (let r=0; r<height-1; r++) for (let c=0; c<width-1; c++) {
          if ([rows[r][c],rows[r+1][c],rows[r][c+1],rows[r+1][c+1]].some(v => v===null)) continue;
          const a=r*width+c; indices.push(a,a+width,a+1,a+1,a+width,a+width+1);
        }
        geometry.setAttribute("position",new THREE.Float32BufferAttribute(points,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
        const heightRange=Math.max(...numbers)-base;
        const colors:number[]=[];
        const low=new THREE.Color("#F4DCA1"), high=new THREE.Color("#AA6047");
        rows.forEach(row=>row.forEach(value=>{const color=low.clone().lerp(high,heightRange ? ((value ?? base)-base)/heightRange : .5);colors.push(color.r,color.g,color.b);}));
        geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
        const material = new THREE.MeshStandardMaterial({ vertexColors:true, roughness: .95, side: THREE.DoubleSide, flatShading: true });
        const surface = new THREE.Mesh(geometry,material);
        const scene = new THREE.Scene(); scene.background=new THREE.Color("#FAF7EF"); scene.add(surface,new THREE.AmbientLight(0xffffff,1.8));
        const light=new THREE.DirectionalLight(0xffffff,2.5); light.position.set(-span,-span,span*2); scene.add(light);
        const camera = new THREE.PerspectiveCamera(40,1,.1,span*10); camera.up.set(0,0,1); camera.position.set(0,-span*1.4,span*1.2); camera.lookAt(0,0,(Math.max(...numbers)-base)/2);
        const renderer = new THREE.WebGLRenderer({ antialias:true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); el.appendChild(renderer.domElement);
        const render = () => { const h=Math.max(1,el.clientHeight);renderer.setSize(el.clientWidth,h); camera.aspect=el.clientWidth/h; camera.updateProjectionMatrix(); renderer.render(scene,camera); };
        const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
        let last=0,pressed=false;
        const down=(e:PointerEvent)=>{pressed=true;last=e.clientX;el.setPointerCapture(e.pointerId);};
        const up=(e:PointerEvent)=>{pressed=false;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);};
        const move=(e:PointerEvent) => { if (pressed) { surface.rotation.z+=(e.clientX-last)*.008; render(); } last=e.clientX; };
        const wheel=(e:WheelEvent)=>{e.preventDefault();controls.current(e.deltaY<0 ? "in" : "out");};
        controls.current=action=>{if(action==="reset"){surface.rotation.z=0;camera.zoom=1;}else camera.zoom=Math.max(.6,Math.min(3,camera.zoom*(action==="in" ? 1.15 : 1/1.15)));render();};
        el.addEventListener("pointerdown",down);el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up);el.addEventListener("pointermove",move);el.addEventListener("wheel",wheel,{passive:false});
        const observer=new ResizeObserver(render);observer.observe(el);render();
        let frame=0;const start=performance.now();
        const reveal=(now:number)=>{const t=reduced ? 1 : Math.min(1,(now-start)/1000);surface.rotation.z=-.35*(1-t)**3;render();if(t<1)frame=requestAnimationFrame(reveal);};
        frame=requestAnimationFrame(reveal);
        cleanup=()=>{cancelAnimationFrame(frame);controls.current=()=>{};observer.disconnect();el.removeEventListener("pointerdown",down);el.removeEventListener("pointerup",up);el.removeEventListener("pointercancel",up);el.removeEventListener("pointermove",move);el.removeEventListener("wheel",wheel);geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove();};
      } catch { setError("3D preview is unavailable in this browser. The terrain values remain available."); }
    });
    return () => { disposed=true;cleanup(); };
  },[mesh]);
  return <div className="terrain-preview"><div ref={host} aria-label="3D terrain preview" /><nav className="terrain-controls" aria-label="Terrain controls"><button aria-label="Zoom in terrain" onClick={()=>controls.current("in")}><Plus size={15}/></button><button aria-label="Zoom out terrain" onClick={()=>controls.current("out")}><Minus size={15}/></button><button aria-label="Reset terrain" onClick={()=>controls.current("reset")}><RotateCcw size={14}/></button></nav>{error && <p role="status">{error}</p>}<small>Drag to rotate · scroll to zoom · actual height</small></div>;
}
