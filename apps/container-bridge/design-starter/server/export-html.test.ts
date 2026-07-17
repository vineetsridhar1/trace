import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildSelfContainedHtml, validateSelfContainedHtml } from "./export-html";

const starterRoot = fileURLToPath(new URL("..", import.meta.url));

test("accepts inline scripts, styles, and data assets", () => {
  assert.doesNotThrow(() =>
    validateSelfContainedHtml(
      '<!doctype html><style>.x{background:url(data:image/png;base64,AA)}</style><img src="data:image/png;base64,AA"><script type="module">document.body.dataset.ready="1"</script>',
    ),
  );
});

test("rejects network and local asset references", () => {
  assert.throws(
    () => validateSelfContainedHtml('<script src="/assets/app.js"></script>'),
    /external asset/,
  );
  assert.throws(
    () => validateSelfContainedHtml("<style>.x{background:url(./photo.png)}</style>"),
    /external CSS asset/,
  );
  assert.throws(
    () => validateSelfContainedHtml('<style>@import "https://example.com/font.css";</style>'),
    /unresolved CSS import/,
  );
});

test("builds the design runtime as one self-contained HTML file", async () => {
  const html = await buildSelfContainedHtml(starterRoot);
  assert.match(html, /<script type="module">/);
  assert.match(html, /<style>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref=["'](?!data:)/i);
  validateSelfContainedHtml(html);
});

test("builds a saved preview from the requested commit", async () => {
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: starterRoot,
    encoding: "utf8",
  }).trim();

  const html = await buildSelfContainedHtml(starterRoot, commitSha);

  assert.match(html, /<script type="module">/);
  validateSelfContainedHtml(html);
});

test("rejects export when a declared screen component is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "trace-invalid-design-export-"));
  try {
    await mkdir(join(root, "src", "design", "screens"), { recursive: true });
    await Promise.all(
      ["design.brief.json", "trace.tokens.json"].map((file) =>
        copyFile(join(starterRoot, file), join(root, file)),
      ),
    );
    const manifest = await readFile(join(starterRoot, "design.canvas.json"), "utf8");
    await writeFile(
      join(root, "design.canvas.json"),
      manifest.replace("./screens/WelcomeScreen.tsx", "./screens/MissingScreen.tsx"),
    );

    await assert.rejects(buildSelfContainedHtml(root), /Missing declared screen component/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
