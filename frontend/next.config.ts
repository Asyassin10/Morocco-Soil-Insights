import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep the test adapter's webpack cache separate from the real application.
  distDir: process.env.MSI_E2E_MAP === "1" ? ".next-e2e" : process.env.MSI_E2E_EMPTY_TOKEN === "1" ? ".next-empty" : ".next",
  devIndicators: false,
  webpack(config, { dev }) {
    // The deterministic test adapter is available only to the isolated dev test server.
    if (dev && process.env.MSI_E2E_MAP === "1") {
      config.resolve.alias["mapbox-gl$"] = path.resolve(process.cwd(), "tests/support/mapbox.ts");
    }
    return config;
  },
};
export default nextConfig;
