import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/auth": "http://localhost:4000",
      "/graphql": "http://localhost:4000",
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
      },
    },
  },
});
