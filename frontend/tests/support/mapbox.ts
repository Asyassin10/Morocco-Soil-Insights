// Deterministic development-only map adapter. No imagery or geographic accuracy is simulated.
type Handler = (event?: any) => void;
class TestMap {
  private host: HTMLElement;
  private handlers: Record<string, Handler[]> = {};
  private sources: Record<string, { setData: (data: unknown) => void }> = {};
  private click: (event: MouseEvent) => void;
  doubleClickZoom = { enable() {}, disable() {} };
  constructor(options: { container: HTMLElement }) {
    this.host = options.container;
    this.host.dataset.testMap = "true";
    this.host.dataset.mapOptions=JSON.stringify({...options,container:undefined});
    this.click = event => {
      if ((event.target as HTMLElement).closest(".field-vertex")) return;
      const rect = this.host.getBoundingClientRect();
      const lng = -5.584 + (event.clientX-rect.left)*.00001;
      const lat = 33.800 + (event.clientY-rect.top)*.00001;
      this.handlers.click?.forEach(fn => fn({ lngLat: { lng, lat } }));
    };
    this.host.addEventListener("click", this.click);
    setTimeout(() => this.handlers.load?.forEach(fn => fn()), 50);
  }
  on(name: string, callback: Handler) { (this.handlers[name] ||= []).push(callback); return this; }
  addSource(id: string, _options: unknown) { this.sources[id] = { setData:(data:unknown)=>{this.host.dataset[id.replaceAll("-","")]=JSON.stringify(data);} }; return this; }
  getSource(id: string) { return this.sources[id]; }
  addLayer(_layer: unknown) { return this; }
  getCanvas() { return this.host; }
  setPaintProperty(_id: string, _property: string, _value: unknown) { return this; }
  fitBounds(bounds: unknown, _options: unknown) { this.host.dataset.mapBounds=JSON.stringify(bounds);return this; }
  getCenter() { return { lng: -5.581, lat: 33.803 }; }
  getZoom() { return 15; }
  zoomIn() {} zoomOut() {} resetNorth() {}
  easeTo(_options: unknown) {}
  getContainer() { return this.host; }
  remove() { this.host.removeEventListener("click", this.click); }
}
class TestMarker {
  private element: HTMLElement;
  private position = { lng: 0, lat: 0 };
  private handlers: Record<string, Handler[]> = {};
  constructor(options: { element: HTMLElement; draggable?: boolean }) {
    this.element = options.element;
    if (options.draggable) this.element.addEventListener("pointerup", () => {
      this.position = { lng: this.position.lng+.0001, lat: this.position.lat+.0001 };
      this.handlers.dragend?.forEach(fn => fn());
    });
  }
  setLngLat(position: [number, number]) { this.position = { lng: position[0], lat: position[1] }; return this; }
  getLngLat() { return this.position; }
  addTo(map: TestMap) { map.getContainer().appendChild(this.element); this.element.style.position="absolute"; this.element.style.left="5px"; this.element.style.top="5px"; return this; }
  on(name: string, callback: Handler) { (this.handlers[name] ||= []).push(callback); return this; }
  remove() { this.element.remove(); }
}
export default { Map: TestMap, Marker: TestMarker, accessToken: "" };
