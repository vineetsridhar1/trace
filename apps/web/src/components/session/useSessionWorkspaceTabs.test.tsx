import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";
import { CANVAS_TAB_ID, useSessionWorkspaceTabs } from "./useSessionWorkspaceTabs";

type Options = Parameters<typeof useSessionWorkspaceTabs>[0];

const BASE: Omit<Options, "appCanvas"> = {
  sessions: [{ id: "session-1", name: "Agent" }],
  artifactIds: [],
  terminals: [],
  files: [],
  drafts: [],
  browserTitles: {},
  trafficEndpointId: null,
};

function renderTabs(options: Options): SpatialWorkspaceTab[] {
  let tabs: SpatialWorkspaceTab[] = [];
  function Probe() {
    tabs = useSessionWorkspaceTabs(options);
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return tabs;
}

describe("useSessionWorkspaceTabs", () => {
  it("gives canvas workspaces a preview tab so the preview surface stays reachable", () => {
    const tabs = renderTabs({ ...BASE, canvas: true });

    // Nothing else in the app produces a "surface:" tab id, so without this the
    // renderer's canvas branch is unreachable and canvas groups render no preview.
    const canvasTab = tabs.find((tab) => tab.id === CANVAS_TAB_ID);
    expect(canvasTab).toBeDefined();
    expect(canvasTab?.closable).toBe(false);
    expect(tabs[0]?.id).toBe(CANVAS_TAB_ID);
  });

  it("omits the canvas tab for non-canvas coding groups", () => {
    const tabs = renderTabs({ ...BASE, canvas: false });

    expect(tabs.some((tab) => tab.id === CANVAS_TAB_ID)).toBe(false);
    expect(tabs[0]?.id).toBe("session:session-1");
  });

  it("keeps session, terminal, file, and traffic tabs alongside the canvas", () => {
    const tabs = renderTabs({
      ...BASE,
      canvas: true,
      terminals: [{ id: "term-1", status: "active" }],
      files: [{ filePath: "src/a.ts", fileName: "a.ts" }],
      trafficEndpointId: "endpoint-1",
    });

    expect(tabs.map((tab) => tab.id)).toEqual([
      CANVAS_TAB_ID,
      "session:session-1",
      "terminal:term-1",
      "file:src/a.ts",
      "traffic",
    ]);
  });
});
