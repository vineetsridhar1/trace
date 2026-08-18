import { describe, expect, it } from "vitest";
import {
  activateSpatialTab,
  applySpatialLayoutPreset,
  balanceSpatialGroups,
  countSpatialRegions,
  createSpatialLayout,
  dockSpatialTab,
  focusSpatialGroup,
  getSpatialAxisSpan,
  getSpatialGroups,
  getSpatialRowPositionForTab,
  insertSpatialTab,
  moveSpatialTab,
  replaceSpatialTab,
  normalizeSpatialLayout,
  setSpatialSplitRatio,
  syncSpatialTabs,
  type SpatialLayout,
} from "./spatial-workspace-layout";

describe("spatial workspace layout", () => {
  it("creates a region by docking a tab to an edge", () => {
    const layout = dockSpatialTab(createSpatialLayout(["chat", "terminal"]), "terminal", "right");

    expect(countSpatialRegions(layout.root)).toBe(2);
    expect(layout.root).toMatchObject({ type: "split", direction: "horizontal" });
    expect(getSpatialGroups(layout.root).map((group) => group.tabIds)).toEqual([["chat"], ["terminal"]]);
  });

  it("keeps one horizontal plane and limits it to four regions", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal", "changes", "files"]);
    layout = dockSpatialTab(layout, "browser", "right");
    layout = dockSpatialTab(layout, "terminal", "right");
    layout = dockSpatialTab(layout, "changes", "right");
    const capped = dockSpatialTab(layout, "files", "right");

    expect(countSpatialRegions(layout.root)).toBe(4);
    expect(capped).toBe(layout);
    expect(getSpatialAxisSpan(layout.root, "horizontal")).toBe(4);
  });

  it("creates two rows without flattening the existing horizontal plane", () => {
    let layout = applySpatialLayoutPreset(
      createSpatialLayout(["chat", "browser", "terminal"]),
      "three-columns",
    );
    layout = dockSpatialTab(layout, "browser", "bottom");

    expect(layout.root).toMatchObject({ type: "split", direction: "vertical" });
    expect(countSpatialRegions(layout.root)).toBe(3);
    expect(getSpatialGroups(layout.root).flatMap((group) => group.tabIds).sort()).toEqual([
      "browser",
      "chat",
      "terminal",
    ]);
  });

  it("preserves a vertical split when a tab is split horizontally in one row", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal"]);
    layout = dockSpatialTab(layout, "browser", "bottom");
    layout = insertSpatialTab(layout, "draft:new", "region-2");
    layout = dockSpatialTab(layout, "draft:new", "right");

    expect(layout.root).toMatchObject({ type: "split", direction: "vertical" });
    if (layout.root.type !== "split") throw new Error("Expected a vertical split");
    expect(getSpatialGroups(layout.root.children[0]).map((group) => group.tabIds)).toEqual([
      ["chat", "terminal"],
    ]);
    expect(layout.root.children[1]).toMatchObject({ type: "split", direction: "horizontal" });
    expect(getSpatialGroups(layout.root.children[1]).map((group) => group.tabIds)).toEqual([
      ["browser"],
      ["draft:new"],
    ]);
    expect(getSpatialRowPositionForTab(layout.root, "chat")).toBe("top");
    expect(getSpatialRowPositionForTab(layout.root, "draft:new")).toBe("bottom");
  });

  it("moves a tab across rows while creating a destination column", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal"]);
    layout = dockSpatialTab(layout, "browser", "bottom");
    layout = insertSpatialTab(layout, "draft:new", "region-1");
    layout = dockSpatialTab(layout, "draft:new", "right", "bottom");

    expect(layout.root).toMatchObject({ type: "split", direction: "vertical" });
    if (layout.root.type !== "split") throw new Error("Expected a vertical split");
    expect(getSpatialGroups(layout.root.children[0]).map((group) => group.tabIds)).toEqual([
      ["chat", "terminal"],
    ]);
    expect(getSpatialGroups(layout.root.children[1]).map((group) => group.tabIds)).toEqual([
      ["browser"],
      ["draft:new"],
    ]);
  });

  it("gives three same-direction regions equal top-level space", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal"]);
    layout = dockSpatialTab(layout, "browser", "right");
    layout = dockSpatialTab(layout, "terminal", "right");

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

  it("stores a resized split ratio in the persisted layout model", () => {
    let layout = dockSpatialTab(createSpatialLayout(["chat", "terminal"]), "terminal", "right");
    if (layout.root.type !== "split") throw new Error("Expected a split layout");
    layout = setSpatialSplitRatio(layout, layout.root.id, 0.7);

    expect(layout.root).toMatchObject({ type: "split", ratio: 0.7 });
  });

  it("focuses one horizontal panel and balances the row again", () => {
    let layout = applySpatialLayoutPreset(
      createSpatialLayout(["chat", "browser", "terminal"]),
      "three-columns",
    );
    layout = focusSpatialGroup(layout, "region-2");

    expect(layout.focusedGroupId).toBe("region-2");
    if (layout.root.type !== "split") throw new Error("Expected a split layout");
    expect(layout.root.ratio).toBeCloseTo(0.15);
    if (layout.root.children[1].type !== "split") throw new Error("Expected a nested split");
    expect(layout.root.children[1].ratio).toBeCloseTo(0.7 / 0.85);

    layout = balanceSpatialGroups(layout);
    expect(layout.focusedGroupId).toBeNull();
    if (layout.root.type !== "split") throw new Error("Expected a split layout");
    expect(layout.root.ratio).toBeCloseTo(1 / 3);
    if (layout.root.children[1].type !== "split") throw new Error("Expected a nested split");
    expect(layout.root.children[1].ratio).toBeCloseTo(0.5);
  });

  it("collapses an empty source region when a tab moves into another group", () => {
    let layout = createSpatialLayout(["chat", "terminal"]);
    layout = dockSpatialTab(layout, "terminal", "right");
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

  it("reorders tabs within a rail at the requested insertion point", () => {
    const layout = moveSpatialTab(
      createSpatialLayout(["chat", "browser", "terminal"]),
      "terminal",
      "region-1",
      0,
    );

    expect(getSpatialGroups(layout.root)[0]).toMatchObject({
      tabIds: ["terminal", "chat", "browser"],
      activeTabId: "terminal",
    });
  });

  it("inserts a cross-pane tab at a specific rail position", () => {
    let layout = createSpatialLayout(["chat", "browser", "terminal"]);
    layout = dockSpatialTab(layout, "browser", "right");
    layout = moveSpatialTab(layout, "terminal", "region-2", 0);

    expect(getSpatialGroups(layout.root).map((group) => group.tabIds)).toEqual([
      ["chat"],
      ["terminal", "browser"],
    ]);
  });

  it("keeps an emptied source rail during preview and collapses it on drop", () => {
    let layout = createSpatialLayout(["chat", "browser"]);
    layout = dockSpatialTab(layout, "browser", "right");
    layout = moveSpatialTab(layout, "browser", "region-1", 1, true);

    expect(countSpatialRegions(layout.root)).toBe(2);
    expect(getSpatialGroups(layout.root).map((group) => group.tabIds)).toEqual([
      ["chat", "browser"],
      [],
    ]);

    layout = moveSpatialTab(layout, "browser", "region-1", 1);
    expect(countSpatialRegions(layout.root)).toBe(1);
    expect(getSpatialGroups(layout.root)[0].tabIds).toEqual(["chat", "browser"]);
  });

  it("inserts a new tab into the region that created it", () => {
    let layout = createSpatialLayout(["chat", "browser"]);
    layout = dockSpatialTab(layout, "browser", "right");
    layout = insertSpatialTab(layout, "draft:new", "region-2");

    expect(getSpatialGroups(layout.root).map((group) => group.tabIds)).toEqual([
      ["chat"],
      ["browser", "draft:new"],
    ]);
    expect(getSpatialGroups(layout.root)[1].activeTabId).toBe("draft:new");
  });

  it("replaces a draft tab without moving or collapsing its row", () => {
    let layout = createSpatialLayout(["chat", "draft:top", "draft:bottom"]);
    layout = applySpatialLayoutPreset(layout, "rows");
    const sourceGroup = getSpatialGroups(layout.root).find((group) =>
      group.tabIds.includes("draft:bottom"),
    );
    if (!sourceGroup) throw new Error("Expected the bottom draft group");
    layout = activateSpatialTab(layout, sourceGroup.id, "draft:bottom");

    layout = replaceSpatialTab(layout, "draft:bottom", "terminal:one");

    expect(countSpatialRegions(layout.root)).toBe(2);
    const replacementGroup = getSpatialGroups(layout.root).find((group) =>
      group.tabIds.includes("terminal:one"),
    );
    expect(replacementGroup?.id).toBe(sourceGroup.id);
    expect(replacementGroup?.activeTabId).toBe("terminal:one");
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

  it("activates an existing tab when external selection prefers it", () => {
    const layout = syncSpatialTabs(
      createSpatialLayout(["chat", "terminal"], "chat"),
      ["chat", "terminal"],
      "terminal",
    );

    expect(getSpatialGroups(layout.root)[0].activeTabId).toBe("terminal");
  });

  it("preserves tab groups while applying row and flat column arrangements", () => {
    const single = createSpatialLayout(["chat", "browser", "terminal", "changes"]);
    const columns = applySpatialLayoutPreset(single, "columns");
    const rows = applySpatialLayoutPreset(columns, "rows");
    const fourColumns = applySpatialLayoutPreset(rows, "four-columns");

    expect(columns.root).toMatchObject({ type: "split", direction: "horizontal" });
    expect(getSpatialGroups(columns.root).map((group) => group.tabIds)).toEqual([
      ["browser", "terminal", "changes"],
      ["chat"],
    ]);
    expect(rows.root).toMatchObject({ type: "split", direction: "vertical" });
    expect(getSpatialGroups(rows.root).map((group) => group.tabIds)).toEqual([
      ["terminal", "changes"],
      ["chat"],
      ["browser"],
    ]);
    expect(countSpatialRegions(fourColumns.root)).toBe(4);
    if (fourColumns.root.type !== "split") throw new Error("Expected a vertical split");
    expect(getSpatialAxisSpan(fourColumns.root.children[0], "horizontal")).toBe(3);
    expect(getSpatialGroups(fourColumns.root).flatMap((group) => group.tabIds).sort()).toEqual([
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

  it("normalizes a legacy nested layout to a single horizontal plane", () => {
    const legacyLayout: SpatialLayout = {
      root: {
        type: "split",
        id: "split-1",
        direction: "horizontal",
        children: [
          { type: "group", id: "region-1", tabIds: ["chat"], activeTabId: "chat" },
          {
            type: "split",
            id: "split-2",
            direction: "vertical",
            children: [
              { type: "group", id: "region-2", tabIds: ["browser"], activeTabId: "browser" },
              { type: "group", id: "region-3", tabIds: ["terminal"], activeTabId: "terminal" },
            ],
          },
        ],
      },
      nextGroupNumber: 4,
      nextSplitNumber: 3,
    };
    const normalized = normalizeSpatialLayout(legacyLayout);

    expect(getSpatialAxisSpan(normalized.root, "horizontal")).toBe(3);
    expect(getSpatialGroups(normalized.root)).toHaveLength(3);
    expect(JSON.stringify(normalized.root)).not.toContain('"direction":"vertical"');
  });
});
