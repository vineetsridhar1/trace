import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TracePdfRuntime } from "./TracePdfRuntime";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TracePdfRuntime>
      <App />
    </TracePdfRuntime>
  </StrictMode>,
);
