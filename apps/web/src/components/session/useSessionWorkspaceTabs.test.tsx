import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { SpatialWorkspaceTab } from "./spatial-workspace-types";
import { APP_CANVAS_TAB_ID, useSessionWorkspaceTabs } from "./useSessionWorkspaceTabs";

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
  it("gives app groups a canvas tab so the preview surface stays reachable", () => {
    const tabs = renderTabs({ ...BASE, appCanvas: true });

    // Nothing else in the app produces a "surface:" tab id, so without this the
    // renderer's canvas branch is unreachable and app groups render no preview.
    const canvasTab = tabs.find((tab) => tab.id === APP_CANVAS_TAB_ID);
    expect(canvasTab).toBeDefined();
    expect(canvasTab?.closable).toBe(false);
    expect(tabs[0]?.id).toBe(APP_CANVAS_TAB_ID);
  });

  it("omits the canvas tab for ordinary coding groups", () => {
    const tabs = renderTabs({ ...BASE, appCanvas: false });

    expect(tabs.some((tab) => tab.id === APP_CANVAS_TAB_ID)).toBe(false);
    expect(tabs[0]?.id).toBe("session:session-1");
  });

  it("keeps session, terminal, file, and traffic tabs alongside the canvas", () => {
    const tabs = renderTabs({
      ...BASE,
      appCanvas: true,
      terminals: [{ id: "term-1", status: "active" }],
      files: [{ filePath: "src/a.ts", fileName: "a.ts" }],
      trafficEndpointId: "endpoint-1",
    });

    expect(tabs.map((tab) => tab.id)).toEqual([
      APP_CANVAS_TAB_ID,
      "session:session-1",
      "terminal:term-1",
      "file:src/a.ts",
      "traffic",
    ]);
  });
});
