import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { traceMarkers } from "./vite/trace-markers-plugin";

export default defineConfig({
  plugins: [traceMarkers(), react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@design-system": fileURLToPath(new URL("./design-system/components", import.meta.url)),
    },
  },
  server: {
    allowedHosts: true,
  },
  build: {
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
