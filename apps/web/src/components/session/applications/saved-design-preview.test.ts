import { describe, expect, it } from "vitest";
import { latestSavedDesignPreviewUrl } from "./saved-design-preview";

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
