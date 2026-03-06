import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@trace/shared-ui"],
  },
  server: {
    port: 5180,
    proxy: {
      "/graphql": {
        target: "http://localhost:3100",
        changeOrigin: true,
        ws: true,
      },
      "/auth/github": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/instance": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
