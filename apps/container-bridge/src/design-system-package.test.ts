import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { pack } from "tar-stream";
import { describe, expect, it } from "vitest";
import { materializeDesignSystemPackage } from "./design-system-package.js";

async function fixtureArchive(): Promise<Buffer> {
  const css = `:root { --background:#fff; --surface:#eee; --foreground:#111; --muted-foreground:#555; --border:#ccc; --accent:#064; --accent-foreground:#fff; --destructive:#c00; --success:#080; --warning:#a60; --font-sans:system-ui; --text-base:1rem; --space-1:4; --radius:8; --shadow:none; --focus-ring:none; --motion-duration:150; }`;
  const files: Record<string, string | Buffer> = {
    "manifest.json": JSON.stringify({
      schemaVersion: "trace-design-system/v1",
      id: "fixture",
      name: "Fixture",
      description: "Fixture",
      platforms: ["web"],
      files: {
        guidance: "DESIGN.md",
        tokens: "tokens.css",
        components: "components.manifest.json",
        evidence: "source/evidence.json",
      },
      componentsDirectory: "components",
      assetsDirectory: "assets",
      previewDirectory: "preview",
    }),
    "DESIGN.md": "# Fixture",
    "tokens.css": css,
    "components.manifest.json": JSON.stringify({ components: [] }),
    "preview/foundations.html":
      "<!doctype html><html><body><main><h1>Foundations</h1><p>Semantic token specimens.</p></main></body></html>",
    "preview/components.html":
      "<!doctype html><html><body><main><h1>Components</h1><p>Component specimens.</p></main></body></html>",
    "preview/foundations.png": Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
    "preview/components.png": Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
    "source/evidence.json": "{}",
  };
  const archive = pack();
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    archive.on("end", () => resolve(gzipSync(Buffer.concat(chunks)))),
  );
  for (const [name, body] of Object.entries(files))
    archive.entry({ name: `design-system/${name}` }, body);
  archive.finalize();
  return done;
}

describe("design-system materialization", () => {
  it("verifies and atomically installs a package before returning", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trace-design-system-"));
    try {
      const archive = await fixtureArchive();
      await materializeDesignSystemPackage(root, {
        versionId: "v1",
        downloadUrl: `data:application/gzip;base64,${archive.toString("base64")}`,
        byteSize: archive.byteLength,
        contentDigest: createHash("sha256").update(archive).digest("hex"),
      });
      expect(await readFile(path.join(root, "design-system/manifest.json"), "utf8")).toContain(
        "Fixture",
      );
      expect(await readFile(path.join(root, "trace.tokens.json"), "utf8")).toContain(
        '"primary": "#064"',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
