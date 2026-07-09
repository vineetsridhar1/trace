import { describe, expect, it } from "vitest";
import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";
import { buildCheckpointRestoreInput } from "./CheckpointPanel";

describe("buildCheckpointRestoreInput", () => {
  it("pins app checkpoint restores to Claude Code and cloud hosting", () => {
    const input = buildCheckpointRestoreInput({
      restoreSession: {
        id: "session-1",
        tool: "codex",
        model: "openai-codex/gpt-5.5",
        reasoningEffort: "medium",
        hosting: "local",
        repo: null,
      } as never as SessionEntity,
      sessionGroup: {
        id: "group-1",
        kind: "app",
      } as never as SessionGroupEntity,
      channelId: "channel-1",
      checkpointId: "checkpoint-1",
    });

    expect(input).toMatchObject({
      kind: "app",
      tool: "claude_code",
      model: "openai-codex/gpt-5.5",
      reasoningEffort: "medium",
      hosting: "cloud",
      channelId: "channel-1",
      restoreCheckpointId: "checkpoint-1",
    });
  });

  it("preserves coding checkpoint restore tool and hosting resolution", () => {
    const input = buildCheckpointRestoreInput({
      restoreSession: {
        id: "session-1",
        tool: "codex",
        model: "openai-codex/gpt-5.5",
        reasoningEffort: "medium",
        hosting: "cloud",
        repo: { remoteUrl: "https://github.com/trace/app.git" },
      } as never as SessionEntity,
      sessionGroup: {
        id: "group-1",
        kind: "coding",
      } as never as SessionGroupEntity,
      channelId: null,
      checkpointId: "checkpoint-1",
    });

    expect(input).toMatchObject({
      tool: "codex",
      model: "openai-codex/gpt-5.5",
      reasoningEffort: "medium",
      hosting: "cloud",
      restoreCheckpointId: "checkpoint-1",
    });
    expect(input).not.toHaveProperty("kind");
    expect(input).not.toHaveProperty("channelId");
  });
});
