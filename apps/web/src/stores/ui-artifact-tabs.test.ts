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
});
