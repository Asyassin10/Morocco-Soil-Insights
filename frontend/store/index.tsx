"use client";
import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { Provider, useDispatch, useSelector } from "react-redux";
import { useRef, type ReactNode } from "react";
import type { Analysis, FieldInfo, Geometry, Source, Terrain, SavedLand } from "@/lib/types";

type State = {
  draft: Geometry | null; vertices: [number, number][]; field: FieldInfo | null; filename: string;
  drawing: boolean; editing: boolean; confirmed: boolean; activeLayer: string; source: "Auto" | Source;
  analysis: Analysis | null; terrain: Terrain | null; status: "idle" | "validating" | "loading" | "ready" | "error";
  error: string | null; mapReady: boolean; comparison: SavedLand | null;
};
const initialState: State = { draft: null, vertices: [], field: null, filename: "", drawing: false, editing: false, confirmed: false,
  activeLayer: "ph", source: "Auto", analysis: null, terrain: null, status: "idle", error: null, mapReady: false, comparison: null };
const slice = createSlice({ name: "field", initialState, reducers: {
  patch(state, action: PayloadAction<Partial<State>>) { Object.assign(state, action.payload); },
  reset(state) { return { ...initialState, mapReady: state.mapReady, comparison: state.comparison }; },
  startDrawing(state) { Object.assign(state, { draft: null, vertices: [], field: null, filename: "Drawn field", drawing: true, editing: false, confirmed: false, analysis: null, terrain: null, status: "idle", error: null }); },
}});
export const { patch, reset, startDrawing } = slice.actions;
export const makeStore = () => configureStore({ reducer: { field: slice.reducer } });
type Store = ReturnType<typeof makeStore>;
export const useAppDispatch = useDispatch.withTypes<Store["dispatch"]>();
export const useAppSelector = useSelector.withTypes<ReturnType<Store["getState"]>>();
export function StoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Store | null>(null);
  if (!ref.current) ref.current = makeStore();
  return <Provider store={ref.current}>{children}</Provider>;
}
