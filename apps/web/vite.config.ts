import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const offset = Number(process.env.TRACE_PORT || 0);
const api = `http://localhost:${4000 + offset}`;

export default defineConfig({
  appType: "spa",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      selfDestroying: true,
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon.png",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "Trace",
        short_name: "Trace",
        description: "AI-native project management and development platform",
        theme_color: "#0A0A0B",
        background_color: "#0A0A0B",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The app shell bundle is slightly above Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        // Don't cache API/WS requests
        navigateFallbackDenylist: [
          /^\/graphql/,
          /^\/ws/,
          /^\/auth/,
          /^\/mcp/,
          /^\/slack/,
          /^\/terminal/,
          /^\/\.well-known/,
          /^\/apple-app-site-association/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
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
      "/mcp": api,
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
