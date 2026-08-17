import { describe, expect, it } from "vitest";
import {
  activateSpatialTab,
  applySpatialLayoutPreset,
  countSpatialRegions,
  createSpatialLayout,
  dockSpatialTab,
  getSpatialAxisSpan,
  getSpatialGroups,
  moveSpatialTab,
  syncSpatialTabs,
} from "./spatial-workspace-layout";

describe("spatial workspace layout", () => {
  it("creates a region by docking a tab to an edge", () => {
    const layout = dockSpatialTab(createSpatialLayout(["chat", "terminal"]), "terminal", "region-1", "right");

    expect(countSpatialRegions(layout.root)).toBe(2);
    expect(layout.root).toMatchObject({ type: "split", direction: "horizontal" });
    expect(getSpatialGroups(layout.root).map((group) => group.tabIds)).toEqual([["chat"], ["terminal"]]);
  });

  it("supports nested splits and limits the workspace to four regions", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal", "changes", "files"]);
    layout = dockSpatialTab(layout, "browser", "region-1", "right");
    layout = dockSpatialTab(layout, "terminal", "region-1", "bottom");
    layout = dockSpatialTab(layout, "changes", "region-2", "bottom");
    const capped = dockSpatialTab(layout, "files", "region-1", "left");

    expect(countSpatialRegions(layout.root)).toBe(4);
    expect(capped).toBe(layout);
  });

  it("gives three same-direction regions equal top-level space", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal"]);
    layout = dockSpatialTab(layout, "browser", "region-1", "right");
    layout = dockSpatialTab(layout, "terminal", "region-2", "right");

    expect(layout.root).toMatchObject({ type: "split", direction: "horizontal" });
    if (layout.root.type !== "split") throw new Error("Expected a split layout");
    expect(layout.root.children.map((child) => getSpatialAxisSpan(child, "horizontal"))).toEqual([
      1, 2,
    ]);
    expect(getSpatialAxisSpan(layout.root, "horizontal")).toBe(3);
    expect(getSpatialGroups(layout.root).map((group) => group.tabIds)).toEqual([
      ["chat"],
      ["browser"],
      ["terminal"],
    ]);
  });

  it("collapses an empty source region when a tab moves into another group", () => {
    let layout = createSpatialLayout(["chat", "terminal"]);
    layout = dockSpatialTab(layout, "terminal", "region-1", "right");
    layout = moveSpatialTab(layout, "terminal", "region-1");

    expect(countSpatialRegions(layout.root)).toBe(1);
    expect(getSpatialGroups(layout.root)[0].tabIds).toEqual(["chat", "terminal"]);
  });

  it("moves individual tabs between regions without splitting their siblings", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal", "changes"]);
    layout = applySpatialLayoutPreset(layout, "rows");
    layout = moveSpatialTab(layout, "browser", "region-2");

    expect(countSpatialRegions(layout.root)).toBe(2);
    expect(getSpatialGroups(layout.root).map((group) => group.tabIds)).toEqual([
      ["terminal", "changes"],
      ["chat", "browser"],
    ]);
  });

  it("keeps tab identity and active state while syncing live tabs", () => {
    let layout = createSpatialLayout(["chat", "browser"], "chat");
    layout = activateSpatialTab(layout, "region-1", "browser");
    layout = syncSpatialTabs(layout, ["chat", "browser", "changes"]);

    expect(getSpatialGroups(layout.root)[0]).toMatchObject({
      tabIds: ["chat", "browser", "changes"],
      activeTabId: "browser",
    });
  });

  it("preserves tab groups while applying row, column, and grid arrangements", () => {
    const single = createSpatialLayout(["chat", "browser", "terminal", "changes"]);
    const columns = applySpatialLayoutPreset(single, "columns");
    const rows = applySpatialLayoutPreset(columns, "rows");
    const grid = applySpatialLayoutPreset(rows, "grid");

    expect(columns.root).toMatchObject({ type: "split", direction: "horizontal" });
    expect(getSpatialGroups(columns.root).map((group) => group.tabIds)).toEqual([
      ["browser", "terminal", "changes"],
      ["chat"],
    ]);
    expect(rows.root).toMatchObject({ type: "split", direction: "vertical" });
    expect(getSpatialGroups(rows.root).map((group) => group.tabIds)).toEqual([
      ["browser", "terminal", "changes"],
      ["chat"],
    ]);
    expect(countSpatialRegions(grid.root)).toBe(4);
    expect(getSpatialGroups(grid.root).flatMap((group) => group.tabIds).sort()).toEqual([
      "browser",
      "changes",
      "chat",
      "terminal",
    ]);
  });

  it("offers an equal three-column arrangement", () => {
    const layout = applySpatialLayoutPreset(
      createSpatialLayout(["chat", "browser", "terminal"]),
      "three-columns",
    );

    expect(getSpatialAxisSpan(layout.root, "horizontal")).toBe(3);
    expect(getSpatialGroups(layout.root)).toHaveLength(3);
  });
});
