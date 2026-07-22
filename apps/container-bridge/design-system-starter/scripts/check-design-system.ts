import { access, readFile } from "node:fs/promises";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readPackageFile(path: string): Promise<string> {
  return readFile(new URL(`../design-system/${path}`, import.meta.url), "utf8");
}

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
const manifest = JSON.parse(await readPackageFile("manifest.json")) as unknown;
if (!isRecord(manifest) || manifest.schemaVersion !== "trace-design-system/v1")
  throw new Error("Unsupported design-system manifest");
const css = await readPackageFile("tokens.css");
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

const componentManifest = JSON.parse(await readPackageFile("components.manifest.json")) as unknown;
if (!isRecord(componentManifest) || !Array.isArray(componentManifest.components)) {
  throw new Error("components.manifest.json must contain a components array");
}
const componentPreview = (await readPackageFile("preview/components.html")).toLowerCase();
for (const [index, component] of componentManifest.components.entries()) {
  if (!isRecord(component)) throw new Error(`Component ${index} is invalid`);
  for (const field of ["name", "category", "accessibility", "interaction", "confidence"] as const) {
    if (typeof component[field] !== "string" || !component[field].trim()) {
      throw new Error(`Component ${index} needs ${field}`);
    }
  }
  for (const field of [
    "sourcePaths",
    "exportNames",
    "variants",
    "sizes",
    "states",
    "tokenDependencies",
    "assetDependencies",
    "limitations",
  ] as const) {
    if (!Array.isArray(component[field]) || component[field].some((item) => typeof item !== "string")) {
      throw new Error(`Component ${index} needs string array ${field}`);
    }
  }
  if (!new Set(["portable", "recipe", "reference"]).has(String(component.reuseMode))) {
    throw new Error(`Component ${index} has invalid reuseMode`);
  }
  if (component.reuseMode === "portable") {
    if (typeof component.entry !== "string" || !component.entry.startsWith("components/")) {
      throw new Error(`Portable component ${String(component.name)} needs an internal entry`);
    }
    await access(new URL(`../design-system/${component.entry}`, import.meta.url));
  }
  for (const specimen of [
    component.name,
    ...(component.variants as string[]),
    ...(component.states as string[]),
  ]) {
    if (!componentPreview.includes(specimen.toLowerCase())) {
      throw new Error(`Component specimen is missing from preview: ${specimen}`);
    }
  }
}
console.log("Design-system package and canvas are valid.");
