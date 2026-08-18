import { describe, expect, it } from "vitest";
import { buildGeneratedProjectStartInput } from "./create-quick-session";

describe("buildGeneratedProjectStartInput", () => {
  it("creates a blank repo-less cloud design input", () => {
    expect(buildGeneratedProjectStartInput("design")).toEqual({
      kind: "design",
      hosting: "cloud",
    });
  });

  it("creates a blank repo-less cloud PDF input", () => {
    expect(buildGeneratedProjectStartInput("pdf")).toEqual({
      kind: "pdf",
      hosting: "cloud",
    });
  });

  it("creates a blank cloud app input", () => {
    expect(buildGeneratedProjectStartInput("app")).toEqual({
      kind: "app",
      hosting: "cloud",
    });
  });

  it("keeps an active project as organizational context", () => {
    expect(buildGeneratedProjectStartInput("design", undefined, "channel-1")).toEqual({
      kind: "design",
      hosting: "cloud",
      channelId: "channel-1",
    });
  });

  it("pins a selected design-system version only for Designs", () => {
    expect(buildGeneratedProjectStartInput("design", "version-3")).toEqual({
      kind: "design",
      hosting: "cloud",
      designSystemVersionId: "version-3",
    });
    expect(buildGeneratedProjectStartInput("app", "version-3")).toEqual({
      kind: "app",
      hosting: "cloud",
    });
  });
});
