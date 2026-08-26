import { describe, expect, it } from "vitest";

import { normalizeType, validateType } from "./artifact.js";
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

describe("artifact types", () => {
  it("accepts custom artifact types without format-specific validation", () => {
    expect(normalizeType("html")).toBe("html");
    expect(normalizeType("com.example.prototype.v1")).toBe("com.example.prototype.v1");
    expect(() => validateType("html", manifest([PLAN]))).not.toThrow();
  });

  it("keeps aliases for specialized artifact handling", () => {
    expect(normalizeType("visual-plan")).toBe("trace.visual-plan.v1");
  });

  it("rejects empty or oversized artifact types", () => {
    expect(() => normalizeType(" ")).toThrow("Invalid artifact type");
    expect(() => normalizeType("a".repeat(201))).toThrow("Invalid artifact type");
  });
});
