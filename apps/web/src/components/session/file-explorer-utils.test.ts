import { describe, expect, it } from "vitest";
import { flattenVisibleFileTree, type FileTreeNode } from "./file-explorer-utils";

describe("flattenVisibleFileTree", () => {
  it("includes only expanded descendants in display order", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "src",
        isDirectory: true,
        isLoaded: true,
        children: [
          { name: "app.ts", path: "src/app.ts", isDirectory: false, children: [] },
        ],
      },
      { name: "README.md", path: "README.md", isDirectory: false, children: [] },
    ];

    expect(flattenVisibleFileTree(tree, new Set(["src"]))).toMatchObject([
      { kind: "node", key: "src", depth: 0 },
      { kind: "node", key: "src/app.ts", depth: 1 },
      { kind: "node", key: "README.md", depth: 0 },
    ]);
    expect(flattenVisibleFileTree(tree, new Set())).toMatchObject([
      { kind: "node", key: "src", depth: 0 },
      { kind: "node", key: "README.md", depth: 0 },
    ]);
  });

  it("preserves expanded-directory status messages", () => {
    const tree: FileTreeNode[] = [
      {
        name: "empty",
        path: "empty",
        isDirectory: true,
        isLoaded: true,
        children: [],
      },
    ];

    expect(flattenVisibleFileTree(tree, new Set(["empty"]))).toMatchObject([
      { kind: "node", key: "empty" },
      { kind: "message", key: "empty:empty", message: "empty" },
    ]);
  });
});
