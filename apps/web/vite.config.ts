import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  appType: "spa",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.svg", "icon-512.svg", "apple-touch-icon.svg"],
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
            src: "icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        // Don't cache API/WS requests
        navigateFallbackDenylist: [/^\/graphql/, /^\/ws/, /^\/auth/, /^\/terminal/],
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
    port: 3000,
    proxy: {
      "/auth": "http://localhost:4000",
      "/graphql": "http://localhost:4000",
      "/ws": {
        target: "http://localhost:4000",
        ws: true,
      },
      "/terminal": {
        target: "http://localhost:4000",
        ws: true,
      },
    },
  },
});
