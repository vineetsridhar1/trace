import { describe, expect, it } from "vitest";
import {
  designPreviewModeUrl,
  hasSavedDesignPreview,
  savedDesignPreviewUrl,
} from "./saved-design-preview";

describe("hasSavedDesignPreview", () => {
  it("recognizes the durable group preview", () => {
    expect(hasSavedDesignPreview("/design-previews/groups/group-1")).toBe(true);
  });
});

describe("savedDesignPreviewUrl", () => {
  it("returns the durable group preview", () => {
    expect(savedDesignPreviewUrl("/design-previews/groups/group-1")).toBe(
      "/design-previews/groups/group-1",
    );
  });
});

describe("designPreviewModeUrl", () => {
  it("adds preview mode without disturbing URL fragments", () => {
    expect(designPreviewModeUrl("/design-previews/group-1#screen")).toBe(
      "/design-previews/group-1?__trace_preview=1#screen",
    );
  });

  it("preserves an existing preview mode", () => {
    expect(designPreviewModeUrl("/design-previews/group-1?__trace_preview=1")).toBe(
      "/design-previews/group-1?__trace_preview=1",
    );
  });
});
