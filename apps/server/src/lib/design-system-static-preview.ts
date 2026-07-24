import { packageFilesFromWorkbench } from "./design-system-archive.js";

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function designSystemStaticPreviewStorageKey(
  organizationId: string,
  designSystemId: string,
  commitSha: string,
): string {
  return `design-system-previews/${organizationId}/${designSystemId}/${commitSha}.html`;
}

export function createDesignSystemStaticPreview(
  workbenchFiles: ReadonlyMap<string, Buffer>,
): Buffer {
  const files = packageFilesFromWorkbench(workbenchFiles);
  const foundations = files.get("preview/foundations.html")?.toString("utf8");
  const components = files.get("preview/components.html")?.toString("utf8");
  if (!foundations || !components) {
    throw new Error("Design-system artifact is missing its static HTML previews");
  }

  const manifest = JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "{}") as {
    name?: unknown;
  };
  const title = typeof manifest.name === "string" ? manifest.name : "Design System";
  return Buffer.from(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeAttribute(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; background: #09090b; color: #fafafa; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { display: grid; grid-template-rows: auto 1fr; }
    input { position: absolute; opacity: 0; pointer-events: none; }
    nav { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid #27272a; background: #09090b; }
    label { cursor: pointer; border-radius: 6px; padding: 7px 11px; color: #a1a1aa; font-size: 12px; font-weight: 600; }
    label:hover { color: #fafafa; background: #18181b; }
    .panels, section, iframe { width: 100%; height: 100%; min-height: 0; }
    section { display: none; }
    iframe { border: 0; background: #09090b; }
    #foundations:checked ~ nav label[for="foundations"],
    #components:checked ~ nav label[for="components"] { color: #fafafa; background: #27272a; }
    #foundations:checked ~ .panels .foundations,
    #components:checked ~ .panels .components { display: block; }
  </style>
</head>
<body>
  <input id="foundations" name="board" type="radio" checked>
  <input id="components" name="board" type="radio">
  <nav aria-label="Design system boards">
    <label for="foundations">Foundations</label>
    <label for="components">Components</label>
  </nav>
  <div class="panels">
    <section class="foundations"><iframe title="Foundations" srcdoc="${escapeAttribute(foundations)}"></iframe></section>
    <section class="components"><iframe title="Components" srcdoc="${escapeAttribute(components)}"></iframe></section>
  </div>
</body>
</html>`);
}
