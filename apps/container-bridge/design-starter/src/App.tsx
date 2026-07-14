import manifestSource from "../design.canvas.json";
import { DesignCanvas } from "./canvas/DesignCanvas";
import { validateDesignManifest } from "./canvas/manifest";

const screenModules = import.meta.glob("./design/screens/*.tsx", { eager: true });
const manifest = validateDesignManifest(manifestSource);

export function App() {
  return <DesignCanvas manifest={manifest} screenModules={screenModules} />;
}
