import { describe, expect, it } from "vitest";
import type { Artifact } from "@trace/gql";
import { visualPlanHtmlPath } from "./visual-plan-file";

describe("visualPlanHtmlPath", () => {
  it("finds a descriptively named plan among supporting files", () => {
    const artifact = {
      manifest: {
        schemaVersion: 1,
        files: [
          {
            path: "evidence/notes.md",
            mediaType: "text/markdown",
            size: 1,
            digest: "notes",
          },
          {
            path: "implementation-approach.html",
            mediaType: "text/html",
            size: 1,
            digest: "plan",
          },
        ],
      },
    } as Pick<Artifact, "manifest">;

    expect(visualPlanHtmlPath(artifact)).toBe("implementation-approach.html");
  });

  it("returns null when the manifest has no HTML file", () => {
    const artifact = {
      manifest: { schemaVersion: 1, files: [] },
    } as Pick<Artifact, "manifest">;

    expect(visualPlanHtmlPath(artifact)).toBeNull();
  });
});
