import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Animation } from "./Animation";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Animation />
  </StrictMode>,
);
