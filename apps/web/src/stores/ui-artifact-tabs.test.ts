import { afterEach, describe, expect, it } from "vitest";
import { useUIStore } from "./ui";

describe("artifact tabs", () => {
  afterEach(() => {
    useUIStore.setState({
      openArtifactTabsByGroup: {},
      activeArtifactIdsByGroup: {},
    });
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
});
