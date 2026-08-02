import { describe, expect, it } from "vitest";

import { validateType } from "./artifact.js";
import type { ArtifactBundleManifest } from "../lib/artifact-bundle.js";

function manifest(files: Array<{ path: string; mediaType: string }>): ArtifactBundleManifest {
  return {
    schemaVersion: 1,
    files: files.map((file) => ({ ...file, size: 1, digest: "sha256:test" })),
  };
}

const PLAN = { path: "plan.html", mediaType: "text/html" };

describe("validateType for visual plans", () => {
  it("accepts a bundle holding only plan.html", () => {
    expect(() => validateType("trace.visual-plan.v1", manifest([PLAN]))).not.toThrow();
  });

  it("rejects sibling files, which the single-page render cannot load", () => {
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([PLAN, { path: "assets/flow.png", mediaType: "image/png" }]),
      ),
    ).toThrow("Remove assets/flow.png");
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([PLAN, { path: "plan.css", mediaType: "text/css" }]),
      ),
    ).toThrow("Remove plan.css");
  });

  it("requires plan.html at the root", () => {
    expect(() =>
      validateType("trace.visual-plan.v1", manifest([{ path: "plan.mdx", mediaType: "text/mdx" }])),
    ).toThrow("require plan.html at the root");
  });
});
