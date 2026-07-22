import { describe, expect, it } from "vitest";
import {
  hasSavedDesignPreview,
  latestSavedDesignPreviewUrl,
  savedDesignPreviewUrl,
} from "./saved-design-preview";

describe("latestSavedDesignPreviewUrl", () => {
  it("chooses the newest completed saved design preview", () => {
    expect(
      latestSavedDesignPreviewUrl([
        {
          id: "old",
          committedAt: "2026-07-16T12:00:00.000Z",
          previewStatus: "captured",
          previewUrl: "/design-previews/old",
        },
        {
          id: "pending",
          committedAt: "2026-07-17T12:00:00.000Z",
          previewStatus: "pending",
          previewUrl: "/design-previews/pending",
        },
        {
          id: "new",
          committedAt: "2026-07-17T11:00:00.000Z",
          previewStatus: "captured",
          previewUrl: "/design-previews/new",
        },
      ] as never),
    ).toBe("/design-previews/new");
  });
});

describe("hasSavedDesignPreview", () => {
  it("recognizes the durable group preview when no checkpoint preview exists", () => {
    expect(hasSavedDesignPreview("/design-previews/groups/group-1", [])).toBe(true);
  });
});

describe("savedDesignPreviewUrl", () => {
  it("falls back to the newest checkpoint preview", () => {
    expect(
      savedDesignPreviewUrl(null, [
        {
          id: "checkpoint-1",
          committedAt: "2026-07-17T12:00:00.000Z",
          previewStatus: "captured",
          previewUrl: "/design-previews/checkpoint-1",
        },
      ] as never),
    ).toBe("/design-previews/checkpoint-1");
  });

  it("prefers the latest durable group preview", () => {
    expect(
      savedDesignPreviewUrl("/design-previews/groups/group-1", [
        {
          id: "checkpoint-1",
          committedAt: "2026-07-17T12:00:00.000Z",
          previewStatus: "captured",
          previewUrl: "/design-previews/checkpoint-1",
        },
      ] as never),
    ).toBe("/design-previews/groups/group-1");
  });
});
