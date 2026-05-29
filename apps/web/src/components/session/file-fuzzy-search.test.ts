import { describe, expect, it } from "vitest";
import { searchFilePaths, scoreFilePath } from "./file-fuzzy-search";

describe("file fuzzy search", () => {
  it("matches characters across a file path", () => {
    expect(
      scoreFilePath("apps/web/src/components/session/SessionGroupDetailView.tsx", "sgdv"),
    ).toBeGreaterThan(0);
  });

  it("prioritizes basename prefix matches", () => {
    const results = searchFilePaths(
      [
        "apps/web/src/components/session/SessionGroupDetailView.tsx",
        "apps/web/src/components/session/GroupTabStrip.tsx",
        "packages/shared/src/models.ts",
      ],
      "group",
      10,
    );

    expect(results[0]?.path).toBe("apps/web/src/components/session/GroupTabStrip.tsx");
  });

  it("requires every space-separated token to match", () => {
    const results = searchFilePaths(
      [
        "apps/web/src/components/session/FileCommandPalette.tsx",
        "apps/web/src/components/sidebar/ChannelItem.tsx",
      ],
      "file palette",
      10,
    );

    expect(results.map((result) => result.path)).toEqual([
      "apps/web/src/components/session/FileCommandPalette.tsx",
    ]);
  });
});
