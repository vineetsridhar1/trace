import { describe, expect, it } from "vitest";
import type { Channel, Repo } from "@trace/gql";
import { buildHomeStartInput } from "./create-home-session";

const repo = { id: "repo-1", name: "trace" } as Repo;
const channel = { id: "channel-1", name: "Trace", type: "coding", repo } as Channel;

describe("buildHomeStartInput", () => {
  it("preserves the shared composer model, effort, and interaction settings", () => {
    expect(
      buildHomeStartInput(
        {
          prompt: "  Fix the composer  ",
          kind: "coding",
          tool: "codex",
          model: "gpt-5.3-codex",
          reasoningEffort: "high",
          interactionMode: "plan",
          repo,
        },
        channel,
      ),
    ).toEqual({
      kind: "coding",
      tool: "codex",
      model: "gpt-5.3-codex",
      reasoningEffort: "high",
      interactionMode: "plan",
      prompt: "Fix the composer",
      repoId: "repo-1",
      channelId: "channel-1",
    });
  });

  it("keeps generated work repo-free and cloud-hosted", () => {
    expect(
      buildHomeStartInput(
        {
          prompt: "Create a product animation",
          kind: "animation",
          tool: "claude_code",
          model: null,
          reasoningEffort: null,
          interactionMode: "code",
          repo,
        },
        null,
      ),
    ).toEqual({
      kind: "animation",
      tool: "claude_code",
      model: null,
      reasoningEffort: null,
      interactionMode: "code",
      prompt: "Create a product animation",
      hosting: "cloud",
    });
  });
});
