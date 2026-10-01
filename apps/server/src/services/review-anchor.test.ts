import { describe, expect, it } from "vitest";
import type { ReviewProviderFile } from "./review-provider.js";
import { reconcileReviewAnchor } from "./review-anchor.js";

function file(patch: string, overrides: Partial<ReviewProviderFile> = {}): ReviewProviderFile {
  return {
    path: "src/app.ts",
    previousPath: null,
    status: "modified",
    additions: 1,
    deletions: 1,
    patch,
    baseBlobId: "base-2",
    headBlobId: "head-2",
    ...overrides,
  };
}

const anchor = {
  snapshotId: "snapshot-1",
  filePath: "src/app.ts",
  side: "head",
  startLine: 10,
  endLine: 11,
  selectedText: "const answer = 42;\nreturn answer;",
  context: "const answer = 42;\nreturn answer;",
  status: "current",
};

describe("reconcileReviewAnchor", () => {
  it("keeps an unchanged exact block current", () => {
    const result = reconcileReviewAnchor(anchor, "line", "snapshot-2", [
      file("@@ -10,2 +10,2 @@\n const answer = 42;\n return answer;"),
    ]);
    expect(result).toMatchObject({
      snapshotId: "snapshot-2",
      startLine: 10,
      endLine: 11,
      status: "current",
    });
  });

  it.each(["head", "base"])("preserves a blank line on the %s side", (side) => {
    const result = reconcileReviewAnchor(
      { ...anchor, side, endLine: 10, selectedText: "" },
      "line",
      "snapshot-2",
      [file("@@ -9,3 +9,3 @@\n const gameId = params.gameId;\n \n return getGame(gameId);")],
    );
    expect(result).toMatchObject({ startLine: 10, endLine: 10, status: "current" });
  });

  it("recovers a previously misclassified blank line", () => {
    const result = reconcileReviewAnchor(
      { ...anchor, endLine: 10, selectedText: "", status: "outdated" },
      "line",
      "snapshot-2",
      [file("@@ -9,2 +9,2 @@\n const game = getGame();\n ")],
    );
    expect(result.status).toBe("current");
  });

  it("does not confuse missing text or a malformed range with one blank line", () => {
    for (const invalid of [
      { ...anchor, endLine: 10, selectedText: undefined },
      { ...anchor, selectedText: "" },
    ]) {
      expect(
        reconcileReviewAnchor(invalid, "line", "snapshot-2", [file("@@ -10 +10 @@\n ")]).status,
      ).toBe("outdated");
    }
  });

  it("still marks a blank line outdated when it is absent", () => {
    expect(
      reconcileReviewAnchor({ ...anchor, endLine: 10, selectedText: "" }, "line", "snapshot-2", [
        file("@@ -10 +10 @@\n+return game;"),
      ]).status,
    ).toBe("outdated");
  });

  it("relocates an exact block that moved", () => {
    const result = reconcileReviewAnchor(anchor, "line", "snapshot-2", [
      file("@@ -20,2 +20,2 @@\n const answer = 42;\n return answer;"),
    ]);
    expect(result).toMatchObject({
      snapshotId: "snapshot-2",
      startLine: 20,
      endLine: 21,
      originalLine: 10,
      status: "relocated",
    });
  });

  it("follows a renamed file", () => {
    const result = reconcileReviewAnchor(anchor, "line", "snapshot-2", [
      file("@@ -10,2 +10,2 @@\n const answer = 42;\n return answer;", {
        path: "src/main.ts",
        previousPath: "src/app.ts",
      }),
    ]);
    expect(result).toMatchObject({ filePath: "src/main.ts", status: "relocated" });
  });

  it("marks the anchor outdated only when the exact block is absent", () => {
    const result = reconcileReviewAnchor(anchor, "line", "snapshot-2", [
      file("@@ -10 +10 @@\n-const answer = 42;\n+const answer = 43;"),
    ]);
    expect(result).toMatchObject({ snapshotId: "snapshot-2", status: "outdated" });
  });
});
