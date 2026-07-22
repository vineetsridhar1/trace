import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateDesignProject } from "../scripts/design-qa";

const execFileAsync = promisify(execFile);
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const COMMIT_SHA = /^[a-f0-9]{40,64}$/i;

export function validateSelfContainedHtml(html: string): void {
  // The bundled JS is inlined into a <script> before validation, so its source
  // text is part of `html`. Asset-tag- or url()-shaped string literals inside
  // that JS (e.g. a format string like `<img src="%s">`) are NOT real external
  // assets — scanning them produced false positives that failed the export.
  // Strip inlined <script> bodies (keeping the tags, so a genuinely external
  // `<script src>` is still caught) before scanning markup and CSS.
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

export async function buildSelfContainedHtml(root: string, commitSha?: string): Promise<string> {
  if (!commitSha) return buildSelfContainedHtmlFromRoot(root);
  if (!COMMIT_SHA.test(commitSha)) throw new Error("Invalid design export commit");

  const exportRoot = await mkdtemp(join(tmpdir(), "trace-design-checkpoint-"));
  const worktree = join(exportRoot, "repository");
  try {
    const { stdout: repositoryRootOutput } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: root },
    );
    const repositoryRoot = repositoryRootOutput.trim();
    const projectPath = relative(repositoryRoot, root);
    if (projectPath.startsWith(".."))
      throw new Error("Design export root is outside its repository");
    await execFileAsync("git", ["rev-parse", "--verify", `${commitSha}^{commit}`], { cwd: root });
    await execFileAsync("git", ["worktree", "add", "--detach", worktree, commitSha], { cwd: root });
    const projectRoot = join(worktree, projectPath);
    // Worktrees intentionally exclude untracked files. Reuse the already-installed
    // dependencies from the live workspace without letting the export read its source.
    await symlink(join(root, "node_modules"), join(projectRoot, "node_modules"), "junction");
    return await buildSelfContainedHtmlFromRoot(projectRoot);
  } finally {
    await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: root }).catch(
      () => {},
    );
    await rm(exportRoot, { recursive: true, force: true });
  }
}

async function buildSelfContainedHtmlFromRoot(root: string): Promise<string> {
  const report = await validateDesignProject(root);
  if (report.errors.length > 0) {
    throw new Error(`Design validation failed:\n${report.errors.join("\n")}`);
  }
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
