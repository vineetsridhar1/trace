import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));

export function validateSelfContainedHtml(html: string): void {
  const assetTag =
    /<(?:script|link|img|source|video|audio|use|image)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(assetTag)) {
    const reference = match[1];
    if (!reference.startsWith("data:") && !reference.startsWith("#")) {
      throw new Error(`Export contains an external asset reference: ${reference}`);
    }
  }
  const cssUrl = /url\(\s*["']?(?!data:)([^)'"\s]+)["']?\s*\)/gi;
  const cssMatch = cssUrl.exec(html);
  if (cssMatch) throw new Error(`Export contains an external CSS asset: ${cssMatch[1]}`);
}

export async function buildSelfContainedHtml(root: string): Promise<string> {
  const outputDir = await mkdtemp(join(tmpdir(), "trace-design-export-"));
  try {
    await execFileAsync(
      process.execPath,
      [viteCli, "build", "--outDir", outputDir, "--emptyOutDir"],
      {
        cwd: root,
        env: { ...process.env, TRACE_DESIGN_EXPORT: "1" },
      },
    );
    let html = await readFile(join(outputDir, "index.html"), "utf8");
    const scriptPattern = /<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
    const stylePattern = /<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
    const scripts = [...html.matchAll(scriptPattern)];
    const styles = [...html.matchAll(stylePattern)];

    for (const match of scripts) {
      const source = await readFile(join(outputDir, match[1].replace(/^\//, "")), "utf8");
      html = html.replace(
        match[0],
        () => `<script type="module">${source.replace(/<\/script/gi, "<\\/script")}</script>`,
      );
    }
    for (const match of styles) {
      const source = await readFile(join(outputDir, match[1].replace(/^\//, "")), "utf8");
      html = html.replace(
        match[0],
        () => `<style>${source.replace(/<\/style/gi, "<\\/style")}</style>`,
      );
    }
    validateSelfContainedHtml(html);
    return html;
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}
