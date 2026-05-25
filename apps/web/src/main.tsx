import "./lib/platform-web";
import "./lib/event-bindings";
import "./notifications/handlers";
import React, { useSyncExternalStore } from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "urql";
import { client, getClientRevision, subscribeClientRevision } from "./lib/urql";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";

sessionStorage.removeItem("chunk-reload");
window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem("chunk-reload")) {
    sessionStorage.setItem("chunk-reload", "1");
    window.location.reload();
  }
});

function Root() {
  useSyncExternalStore(subscribeClientRevision, getClientRevision, getClientRevision);

  return (
    <AppErrorBoundary>
      <Provider value={client}>
        <App />
      </Provider>
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
