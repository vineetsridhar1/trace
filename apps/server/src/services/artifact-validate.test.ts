import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/storage/index.js", () => ({
  storage: { putObject: vi.fn(), deleteObject: vi.fn(), getObject: vi.fn() },
}));

import { validateType } from "./artifact.js";
import type { ArtifactBundleManifest } from "../lib/artifact-bundle.js";

function manifest(files: Array<{ path: string; mediaType: string }>): ArtifactBundleManifest {
  return {
    schemaVersion: 1,
    files: files.map((file) => ({ ...file, size: 1, digest: "sha256:test" })),
  };
}

const PLAN = { path: "implementation-approach.html", mediaType: "text/html" };

describe("validateType for visual plans", () => {
  it("accepts one descriptively named HTML file", () => {
    expect(() => validateType("trace.visual-plan.v1", manifest([PLAN]))).not.toThrow();
  });

  it("accepts supporting files in the uploaded plan folder", () => {
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([PLAN, { path: "evidence/notes.md", mediaType: "text/markdown" }]),
      ),
    ).not.toThrow();
  });

  it("requires exactly one HTML file", () => {
    expect(() =>
      validateType("trace.visual-plan.v1", manifest([{ path: "plan.mdx", mediaType: "text/mdx" }])),
    ).toThrow("require one HTML file");
    expect(() =>
      validateType(
        "trace.visual-plan.v1",
        manifest([PLAN, { path: "alternate.html", mediaType: "text/html" }]),
      ),
    ).toThrow("more than one HTML file");
  });
});

describe("validateType for media", () => {
  it("requires an image artifact to contain exactly one image file", () => {
    expect(() =>
      validateType("trace.image.v1", manifest([{ path: "image.png", mediaType: "image/png" }])),
    ).not.toThrow();
    expect(() =>
      validateType(
        "trace.image.v1",
        manifest([
          { path: "image.png", mediaType: "image/png" },
          { path: "notes.txt", mediaType: "text/plain" },
        ]),
      ),
    ).toThrow("exactly one file");
  });

  it("requires a video artifact to contain exactly one video file", () => {
    expect(() =>
      validateType("trace.video.v1", manifest([{ path: "demo.mp4", mediaType: "video/mp4" }])),
    ).not.toThrow();
    expect(() =>
      validateType(
        "trace.video.v1",
        manifest([
          { path: "demo.mp4", mediaType: "video/mp4" },
          { path: "poster.png", mediaType: "image/png" },
        ]),
      ),
    ).toThrow("exactly one file");
  });
});
