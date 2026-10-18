import type { Metadata } from "next";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { StoreProvider } from "@/store";

export const metadata: Metadata = { title: "Morocco Soil Insights", description: "Explore Morocco's soils. Draw a field, compare predictions, and understand the ground beneath you." };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><StoreProvider>{children}</StoreProvider></body></html>;
}
