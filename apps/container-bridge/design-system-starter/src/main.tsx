import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../design-system/tokens.css";
import "./style.css";
import { Workbench } from "./workbench/Workbench";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Workbench />
  </StrictMode>,
);
