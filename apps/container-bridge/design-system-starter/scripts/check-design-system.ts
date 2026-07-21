import { access, readFile } from "node:fs/promises";
const required = [
  "manifest.json",
  "DESIGN.md",
  "tokens.css",
  "components.manifest.json",
  "preview/foundations.html",
  "preview/components.html",
  "preview/foundations.png",
  "preview/components.png",
  "source/evidence.json",
];
for (const file of required) await access(new URL(`../design-system/${file}`, import.meta.url));
const manifest = JSON.parse(
  await readFile(new URL("../design-system/manifest.json", import.meta.url), "utf8"),
) as { schemaVersion?: string };
if (manifest.schemaVersion !== "trace-design-system/v1")
  throw new Error("Unsupported design-system manifest");
const css = await readFile(new URL("../design-system/tokens.css", import.meta.url), "utf8");
for (const token of [
  "--background",
  "--surface",
  "--foreground",
  "--border",
  "--accent",
  "--font-sans",
  "--space-1",
  "--radius",
  "--focus-ring",
  "--motion-duration",
])
  if (!css.includes(`${token}:`)) throw new Error(`Missing ${token}`);
console.log("Design-system package and canvas are valid.");
