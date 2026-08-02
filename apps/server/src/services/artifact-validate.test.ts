import { describe, expect, it } from "vitest";

import { validateType } from "./artifact.js";
import type { ArtifactBundleManifest } from "../lib/artifact-bundle.js";

function manifest(files: Array<{ path: string; mediaType: string }>): ArtifactBundleManifest {
  return {
    schemaVersion: 1,
    files: files.map((file) => ({ ...file, size: 1, digest: "sha256:test" })),
  };
}

const PLAN = { path: "plan.mdx", mediaType: "text/mdx" };

describe("validateType for visual plans", () => {
  it("accepts plan.mdx alone and with images under assets/", () => {
    expect(() => validateType("trace.visual-plan.v1", manifest([PLAN]))).not.toThrow();
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([PLAN, { path: "assets/flow.png", mediaType: "image/png" }]),
      ),
    ).not.toThrow();
  });

  it("rejects a second document so plans stay one reviewable file", () => {
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([PLAN, { path: "canvas.mdx", mediaType: "text/mdx" }]),
      ),
    ).toThrow("Remove canvas.mdx");
  });

  it("rejects non-image files under assets/", () => {
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([PLAN, { path: "assets/flow.md", mediaType: "text/markdown" }]),
      ),
    ).toThrow("Remove assets/flow.md");
  });

  it("still requires plan.mdx at the root", () => {
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([{ path: "notes.mdx", mediaType: "text/mdx" }]),
      ),
    ).toThrow("require plan.mdx at the root");
  });
});
