import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const offset = Number(process.env.TRACE_PORT || 0);
const api = `http://localhost:${4000 + offset}`;

export default defineConfig({
  appType: "spa",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    allowedHosts: [".ngrok-free.app", ".ngrok-free.dev"],
    port: 3000 + offset,
    proxy: {
      "/.well-known/apple-app-site-association": api,
      "/apple-app-site-association": api,
      "/auth": api,
      "/graphql": api,
      "/slack": api,
      "/uploads": api,
      "/ws": {
        target: api,
        ws: true,
      },
      "/terminal": {
        target: api,
        ws: true,
      },
    },
  },
});
