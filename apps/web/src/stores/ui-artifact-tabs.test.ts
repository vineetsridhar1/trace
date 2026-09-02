import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "./ui";

describe("artifact tabs", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState: vi.fn() });
  });

  afterEach(() => {
    useUIStore.setState({
      openArtifactTabsByGroup: {},
      activeArtifactIdsByGroup: {},
      openFileTabsByGroup: {},
      activeFilePathsByGroup: {},
      openSessionTabsByGroup: {},
      hiddenSessionTabsByGroup: {},
      activeChannelId: null,
      activeSessionGroupId: null,
      activeSessionId: null,
    });
    vi.unstubAllGlobals();
  });

  it("keeps open and active artifacts scoped to their session group", () => {
    const state = useUIStore.getState();
    state.openArtifactTab("group_1", "artifact_1");
    state.openArtifactTab("group_1", "artifact_2");
    state.openArtifactTab("group_2", "artifact_3");

    expect(useUIStore.getState().openArtifactTabsByGroup).toEqual({
      group_1: ["artifact_1", "artifact_2"],
      group_2: ["artifact_3"],
    });
    expect(useUIStore.getState().activeArtifactIdsByGroup).toEqual({
      group_1: "artifact_2",
      group_2: "artifact_3",
    });
  });

  it("selects an adjacent artifact when the active tab closes", () => {
    const state = useUIStore.getState();
    state.openArtifactTab("group_1", "artifact_1");
    state.openArtifactTab("group_1", "artifact_2");

    state.closeArtifactTab("group_1", "artifact_2");

    expect(useUIStore.getState().openArtifactTabsByGroup.group_1).toEqual(["artifact_1"]);
    expect(useUIStore.getState().activeArtifactIdsByGroup.group_1).toBe("artifact_1");
  });

  it("keeps open files and their active file scoped to a session group", () => {
    const state = useUIStore.getState();
    state.openFileTab("group_1", { filePath: "src/one.ts", fileName: "one.ts" });
    state.openFileTab("group_1", { filePath: "src/two.ts", fileName: "two.ts" });
    state.openFileTab("group_2", { filePath: "src/three.ts", fileName: "three.ts" });

    expect(useUIStore.getState().openFileTabsByGroup).toEqual({
      group_1: [
        { filePath: "src/one.ts", fileName: "one.ts" },
        { filePath: "src/two.ts", fileName: "two.ts" },
      ],
      group_2: [{ filePath: "src/three.ts", fileName: "three.ts" }],
    });
    expect(useUIStore.getState().activeFilePathsByGroup).toEqual({
      group_1: "src/two.ts",
      group_2: "src/three.ts",
    });
  });

  it("clears only the active file when closing an active tab", () => {
    const state = useUIStore.getState();
    state.openFileTab("group_1", { filePath: "src/one.ts", fileName: "one.ts" });
    state.openFileTab("group_1", { filePath: "src/two.ts", fileName: "two.ts" });

    state.closeFileTab("group_1", "src/two.ts");

    expect(useUIStore.getState().openFileTabsByGroup.group_1).toEqual([
      { filePath: "src/one.ts", fileName: "one.ts" },
    ]);
    expect(useUIStore.getState().activeFilePathsByGroup.group_1).toBeNull();
  });

  it("keeps the group open when its final session tab is hidden", () => {
    useUIStore.setState({
      activeChannelId: "channel_1",
      activeSessionGroupId: "group_1",
      activeSessionId: "session_1",
      openSessionTabsByGroup: { group_1: ["session_1"] },
    });

    useUIStore.getState().hideSessionTab("group_1", "session_1", "2026-08-17T00:00:00.000Z");

    expect(useUIStore.getState()).toMatchObject({
      activeSessionGroupId: "group_1",
      activeSessionId: null,
      openSessionTabsByGroup: { group_1: [] },
      hiddenSessionTabsByGroup: { group_1: { session_1: "2026-08-17T00:00:00.000Z" } },
    });
  });

  it("keeps a tab hidden when a server snapshot from before the close arrives", () => {
    const state = useUIStore.getState();
    const requestedAt = "2026-08-20T10:00:00.000Z";
    state.hideSessionTab("group_1", "session_1", "2026-08-20T10:00:01.000Z");

    state.setHiddenSessionTabs("group_1", [], { keepHiddenSince: requestedAt });

    expect(useUIStore.getState().hiddenSessionTabsByGroup.group_1).toEqual({
      session_1: "2026-08-20T10:00:01.000Z",
    });
  });

  it("drops a locally hidden tab the server snapshot already covers", () => {
    const state = useUIStore.getState();
    state.hideSessionTab("group_1", "session_1", "2026-08-20T09:59:00.000Z");

    state.setHiddenSessionTabs("group_1", [], {
      keepHiddenSince: "2026-08-20T10:00:00.000Z",
    });

    expect(useUIStore.getState().hiddenSessionTabsByGroup.group_1).toEqual({});
  });

  it("does not reopen a hidden session through implicit tab initialization", () => {
    useUIStore.setState({
      hiddenSessionTabsByGroup: { group_1: { session_2: "2026-08-17T00:00:00.000Z" } },
    });

    const state = useUIStore.getState();
    state.initSessionTabs("group_1", ["session_1", "session_2"]);
    state.openSessionTab("group_1", "session_2");

    expect(useUIStore.getState().openSessionTabsByGroup.group_1).toEqual(["session_1"]);
  });

  it("replaces the persisted active session when hiding the selected tab", () => {
    useUIStore.setState({
      activeChannelId: "channel_1",
      activeSessionGroupId: "group_1",
      activeSessionId: "session_2",
      openSessionTabsByGroup: { group_1: ["session_1", "session_2"] },
      lastSelectedSessionIdsByGroup: { group_1: "session_2" },
    });

    useUIStore.getState().hideSessionTab("group_1", "session_2", "2026-08-17T00:00:00.000Z");

    expect(useUIStore.getState()).toMatchObject({
      activeSessionId: "session_1",
      lastSelectedSessionIdsByGroup: { group_1: "session_1" },
    });
    expect(localStorage.getItem("trace:activeSessionId")).toBe("session_1");
  });
});
