import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { BridgeAnimationExportCommand } from "@trace/shared";

const execFileAsync = promisify(execFile);

// Shared by the animation and design-system export commands: both build a Vite
// project at a committed ref and upload the self-contained HTML to a presigned
// target. The upload-target shape is identical across both commands.
type SelfContainedExportInput = {
  workdir: string;
  commitSha: string;
  requestId: string;
  uploadTarget: BridgeAnimationExportCommand["uploadTarget"];
};

const SCRIPT_TAG = /<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
const STYLE_TAG = /<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;

// Asset references remaining after inlining mean the bundle isn't actually
// self-contained (it would 404 once served from an isolated static blob with
// no sibling files) — catch that at export time rather than at view time.
export function validateSelfContainedHtml(html: string): void {
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2");
  const assetTag =
    /<(?:script|link|img|source|video|audio|use|image)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of markup.matchAll(assetTag)) {
    const reference = match[1];
    if (!reference.startsWith("data:") && !reference.startsWith("#")) {
      throw new Error(`Export contains an external asset reference: ${reference}`);
    }
  }
  const cssUrl = /url\(\s*["']?(?!data:)([^)'"\s]+)["']?\s*\)/gi;
  const cssMatch = cssUrl.exec(markup);
  if (cssMatch) throw new Error(`Export contains an external CSS asset: ${cssMatch[1]}`);
  if (/@import\s+(?:url\s*\(|["'])/i.test(markup)) {
    throw new Error("Export contains an unresolved CSS import");
  }
}

async function buildSelfContainedHtml(projectRoot: string): Promise<string> {
  const outputDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-animation-build-"));
  try {
    await execFileAsync(
      "pnpm",
      ["exec", "vite", "build", "--outDir", outputDir, "--emptyOutDir"],
      { cwd: projectRoot, timeout: 60_000, maxBuffer: 5 * 1024 * 1024 },
    );
    let html = await fs.promises.readFile(path.join(outputDir, "index.html"), "utf8");
    const scripts = [...html.matchAll(SCRIPT_TAG)];
    const styles = [...html.matchAll(STYLE_TAG)];

    for (const match of scripts) {
      const source = await fs.promises.readFile(
        path.join(outputDir, match[1].replace(/^\//, "")),
        "utf8",
      );
      html = html.replace(
        match[0],
        () => `<script type="module">${source.replace(/<\/script/gi, "<\\/script")}</script>`,
      );
    }
    for (const match of styles) {
      const source = await fs.promises.readFile(
        path.join(outputDir, match[1].replace(/^\//, "")),
        "utf8",
      );
      html = html.replace(
        match[0],
        () => `<style>${source.replace(/<\/style/gi, "<\\/style")}</style>`,
      );
    }
    validateSelfContainedHtml(html);
    return html;
  } finally {
    await fs.promises.rm(outputDir, { recursive: true, force: true });
  }
}

export async function exportSelfContainedHtmlToTarget(
  input: SelfContainedExportInput,
): Promise<void> {
  const exportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-export-"));
  const worktree = path.join(exportDir, "repository");

  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: input.workdir,
    });
    const repoRoot = stdout.trim();
    const projectPath = path.relative(repoRoot, input.workdir);
    if (
      projectPath === ".." ||
      projectPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(projectPath)
    ) {
      throw new Error("Animation workspace is outside its repository");
    }

    await execFileAsync("git", ["rev-parse", "--verify", `${input.commitSha}^{commit}`], {
      cwd: repoRoot,
    });
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, input.commitSha], {
      cwd: repoRoot,
    });

    const projectRoot = path.join(worktree, projectPath);
    await linkInstalledDependencies(input.workdir, projectRoot);
    const html = await buildSelfContainedHtml(projectRoot);
    await uploadHtml(html, input.uploadTarget);
  } finally {
    await execFileAsync("git", ["worktree", "remove", "--force", worktree], {
      cwd: input.workdir,
    }).catch((error: unknown) => {
      console.warn("[self-contained-export] failed to unregister temporary worktree", error);
    });
    await fs.promises.rm(exportDir, { recursive: true, force: true }).catch((error: unknown) => {
      console.warn("[self-contained-export] failed to remove temporary export directory", error);
    });
  }
}

async function linkInstalledDependencies(workdir: string, projectRoot: string): Promise<void> {
  const source = path.join(workdir, "node_modules");
  const destination = path.join(projectRoot, "node_modules");
  if (fs.existsSync(source) && !fs.existsSync(destination)) {
    await fs.promises.symlink(source, destination, "junction");
  }
}

async function uploadHtml(
  html: string,
  target: BridgeAnimationExportCommand["uploadTarget"],
): Promise<void> {
  const bytes = new TextEncoder().encode(html);
  let response: Response;
  if (target.method === "PUT") {
    response = await fetch(target.url, {
      method: "PUT",
      headers: { "content-type": "text/html; charset=utf-8" },
      body: bytes,
    });
  } else {
    const body = new FormData();
    for (const [key, value] of Object.entries(target.fields)) body.append(key, value);
    body.append("file", new Blob([bytes], { type: "text/html; charset=utf-8" }), "export.html");
    response = await fetch(target.url, { method: "POST", body });
  }
  if (!response.ok) throw new Error(`Export upload failed with status ${response.status}`);
}
