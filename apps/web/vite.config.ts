import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backendUrl = process.env.VITE_SERVER_URL || "http://localhost:3100";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@trace/shared-ui"],
  },
  server: {
    port: 5180,
    proxy: {
      "/graphql": {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      "/auth/github": {
        target: backendUrl,
        changeOrigin: true,
      },
      "/instance": {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
