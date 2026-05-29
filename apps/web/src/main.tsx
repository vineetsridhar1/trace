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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Provider value={client}>
        <App />
      </Provider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
