import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "urql";
import { client } from "./lib/urql";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Provider value={client}>
        <App />
      </Provider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
