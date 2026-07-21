import { describe, expect, it } from "vitest";
import { validateDesignSystemPackage, validateDesignSystemPath } from "./design-system.js";

function validFiles(): Map<string, Buffer> {
  const css = `:root { --background:#fff; --surface:#fff; --foreground:#111; --muted-foreground:#555; --border:#ccc; --accent:#064; --accent-foreground:#fff; --destructive:#c00; --success:#080; --warning:#a60; --font-sans:system-ui; --text-base:1rem; --space-1:.25rem; --radius:.5rem; --shadow:0 1px 2px #0003; --focus-ring:0 0 0 2px #06f; --motion-duration:150ms; }`;
  const files = new Map(
    Object.entries({
      "manifest.json": JSON.stringify({
        schemaVersion: "trace-design-system/v1",
        id: "fixture",
        name: "Fixture",
        description: "Fixture system",
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
      "DESIGN.md": "# Fixture\nUse semantic tokens.",
      "tokens.css": css,
      "components.manifest.json": JSON.stringify({ components: [] }),
      "preview/foundations.html": "<!doctype html><title>Foundations</title>",
      "preview/components.html": "<!doctype html><title>Components</title>",
      "source/evidence.json": JSON.stringify({ commit: "abc", evidence: [] }),
    }).map(([key, value]) => [key, Buffer.from(value)]),
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  files.set("preview/foundations.png", png);
  files.set("preview/components.png", png);
  return files;
}

describe("design-system package validation", () => {
  it("accepts the v1 package contract", () => {
    expect(validateDesignSystemPackage(validFiles())).toMatchObject({ valid: true, errors: [] });
  });

  it("rejects unsafe paths and unknown manifest fields", () => {
    expect(validateDesignSystemPath("../secret")).toBeTruthy();
    expect(validateDesignSystemPath(".env")).toBeTruthy();
    const files = validFiles();
    const manifest = JSON.parse(files.get("manifest.json")!.toString("utf8")) as Record<
      string,
      unknown
    >;
    manifest.unknown = true;
    files.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
    expect(validateDesignSystemPackage(files).errors).toContain(
      "manifest.json has unknown field: unknown",
    );
  });

  it("rejects unresolved aliases and unsafe portable components", () => {
    const files = validFiles();
    files.set(
      "tokens.css",
      Buffer.from(files.get("tokens.css")!.toString("utf8").replace("#fff", "var(--missing)")),
    );
    files.set(
      "components.manifest.json",
      Buffer.from(
        JSON.stringify({
          components: [{ name: "Button", reuseMode: "portable", entry: "components/Button.tsx" }],
        }),
      ),
    );
    files.set("components/Button.tsx", Buffer.from(`import x from "../../private"; export { x };`));
    const result = validateDesignSystemPackage(files);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("unresolved token alias"))).toBe(true);
    expect(result.errors.some((error) => error.includes("unsafe import"))).toBe(true);
  });
});
