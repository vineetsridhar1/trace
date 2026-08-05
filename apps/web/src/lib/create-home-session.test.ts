import { describe, expect, it } from "vitest";
import type { Channel, Repo } from "@trace/gql";
import { buildHomeStartInput } from "./create-home-session";

const repo = { id: "repo-1", name: "trace" } as Repo;
const channel = { id: "channel-1", name: "Trace", type: "coding", repo } as Channel;

describe("buildHomeStartInput", () => {
  it("preserves the shared composer model, effort, and interaction settings", () => {
    expect(
      buildHomeStartInput({
        prompt: "  Fix the composer  ",
        attachmentKeys: ["uploads/org-1/reference.png"],
        kind: "coding",
        tool: "codex",
        model: "gpt-5.3-codex",
        reasoningEffort: "high",
        interactionMode: "plan",
        channel,
        projectId: "project-1",
        repoId: "repo-1",
        runtimeInstanceId: "bridge-1",
        designSystemVersionId: null,
        designSessionGroupId: "design-1",
      }),
    ).toEqual({
      kind: "coding",
      tool: "codex",
      model: "gpt-5.3-codex",
      reasoningEffort: "high",
      interactionMode: "plan",
      prompt: "Fix the composer",
      attachmentKeys: ["uploads/org-1/reference.png"],
      repoId: "repo-1",
      channelId: "channel-1",
      projectId: "project-1",
      hosting: "local",
      runtimeInstanceId: "bridge-1",
      designSessionGroupId: "design-1",
    });
  });

  it("keeps generated work repo-free and cloud-hosted", () => {
    expect(
      buildHomeStartInput({
        prompt: "Create a product animation",
        attachmentKeys: undefined,
        kind: "animation",
        tool: "claude_code",
        model: null,
        reasoningEffort: null,
        interactionMode: "plan",
        channel: null,
        projectId: null,
        repoId: null,
        runtimeInstanceId: null,
        designSystemVersionId: null,
        designSessionGroupId: "design-1",
      }),
    ).toEqual({
      kind: "animation",
      tool: "claude_code",
      model: null,
      reasoningEffort: null,
      interactionMode: "code",
      prompt: "Create a product animation",
      hosting: "cloud",
      designSessionGroupId: "design-1",
    });
  });

  it("pins a Design session to the selected design system without attaching a design", () => {
    expect(
      buildHomeStartInput({
        prompt: "Explore checkout",
        attachmentKeys: undefined,
        kind: "design",
        tool: "codex",
        model: "gpt-5.3-codex",
        reasoningEffort: "medium",
        interactionMode: "code",
        channel: null,
        projectId: null,
        repoId: null,
        runtimeInstanceId: null,
        designSystemVersionId: "version-2",
        designSessionGroupId: "ignored-design",
      }),
    ).toEqual({
      kind: "design",
      tool: "codex",
      model: "gpt-5.3-codex",
      reasoningEffort: "medium",
      interactionMode: "code",
      prompt: "Explore checkout",
      hosting: "cloud",
      designSystemVersionId: "version-2",
    });
  });
});
