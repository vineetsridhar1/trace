import { describe, expect, it } from "vitest";
import { buildQuickSessionStartInput } from "./quick-session-input";

describe("buildQuickSessionStartInput", () => {
  it("creates a general project session with the linked repo as context", () => {
    expect(
      buildQuickSessionStartInput("channel-1", "repo-1", {
        kind: "general",
      }),
    ).toEqual({
      deferRuntimeSelection: true,
      kind: "general",
      channelId: "channel-1",
      repoId: "repo-1",
    });
  });

  it("allows a project without a repo to start a general session", () => {
    expect(
      buildQuickSessionStartInput("channel-1", undefined, {
        kind: "general",
      }),
    ).toEqual({
      deferRuntimeSelection: true,
      kind: "general",
      channelId: "channel-1",
    });
  });

  it("does not force a kind when continuing an existing session group", () => {
    expect(
      buildQuickSessionStartInput("channel-1", "repo-1", {
        sessionGroupId: "group-1",
        tool: "codex",
      }),
    ).toEqual({
      deferRuntimeSelection: true,
      channelId: "channel-1",
      repoId: "repo-1",
      sessionGroupId: "group-1",
      tool: "codex",
    });
  });
});
