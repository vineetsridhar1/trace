import { describe, expect, it } from "vitest";
import type { Channel, Repo } from "@trace/gql";
import { buildHomeStartInput } from "./create-home-session";

const repo = { id: "repo-1", name: "trace" } as Repo;
const channel = { id: "channel-1", name: "Trace", type: "coding", repo } as Channel;

describe("buildHomeStartInput", () => {
  it("uses a selected local runtime for a general session", () => {
    expect(
      buildHomeStartInput({
        prompt: "Answer this question",
        kind: "general",
        tool: "claude_code",
        model: null,
        reasoningEffort: null,
        interactionMode: "code",
        channel: null,
        projectId: null,
        repoId: null,
        runtimeInstanceId: "bridge-1",
      }),
    ).toMatchObject({ kind: "general", hosting: "local", runtimeInstanceId: "bridge-1" });
  });

  it("falls back to cloud for a general session without a local runtime", () => {
    expect(
      buildHomeStartInput({
        prompt: "Answer this question",
        kind: "general",
        tool: "codex",
        model: null,
        reasoningEffort: null,
        interactionMode: "code",
        channel: null,
        projectId: null,
        repoId: null,
        runtimeInstanceId: null,
      }),
    ).toMatchObject({ kind: "general", hosting: "cloud" });
  });

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
    });
  });

  it("keeps app work repo-free and cloud-hosted", () => {
    expect(
      buildHomeStartInput({
        prompt: "Create a launch tracker",
        kind: "app",
        tool: "claude_code",
        model: null,
        reasoningEffort: null,
        interactionMode: "plan",
        channel: null,
        projectId: null,
        repoId: null,
        runtimeInstanceId: null,
      }),
    ).toEqual({
      kind: "app",
      tool: "claude_code",
      model: null,
      reasoningEffort: null,
      interactionMode: "code",
      prompt: "Create a launch tracker",
      hosting: "cloud",
    });
  });
});
