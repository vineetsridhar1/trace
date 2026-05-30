import "./lib/platform-web";
import "./lib/event-bindings";
import "./notifications/handlers";
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "urql";
import { client } from "./lib/urql";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";

const CHUNK_RELOAD_KEY = "chunk-reload";

window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
  }
});

window.setTimeout(() => {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}, 10_000);

function cleanupServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length === 0) return;

      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      const cleanupReloadKey = "service-worker-cleanup-reload";
      if (navigator.serviceWorker.controller && !sessionStorage.getItem(cleanupReloadKey)) {
        sessionStorage.setItem(cleanupReloadKey, "1");
        window.location.reload();
      }
    })().catch((error: unknown) => {
      console.warn("Failed to clean up service workers", error);
    });
  });
}

cleanupServiceWorkers();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Provider value={client}>
        <App />
      </Provider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
