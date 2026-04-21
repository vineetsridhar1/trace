import { describe, expect, it } from "vitest";
import {
  extractMessagePreview,
  mergeGitCheckpoints,
  rewriteGitCheckpoints,
  sessionPatchFromOutput,
  shouldBumpSortTimestampForOutput,
} from "../src/events/session-output.js";
import type { GitCheckpoint } from "@trace/gql";

describe("sessionPatchFromOutput", () => {
  it("returns workdir + statuses for workspace_ready", () => {
    const patch = sessionPatchFromOutput({
      type: "workspace_ready",
      workdir: "/tmp",
      agentStatus: "active",
      sessionStatus: "in_progress",
    });
    expect(patch).toEqual({
      workdir: "/tmp",
      agentStatus: "active",
      sessionStatus: "in_progress",
    });
  });

  it("returns name for title_generated", () => {
    expect(sessionPatchFromOutput({ type: "title_generated", name: "x" })).toEqual({ name: "x" });
  });

  it("returns branch for branch_renamed", () => {
    expect(sessionPatchFromOutput({ type: "branch_renamed", branch: "main" })).toEqual({
      branch: "main",
    });
  });

  it("returns needs_input for question_pending and plan_pending", () => {
    expect(sessionPatchFromOutput({ type: "question_pending" })).toEqual({
      sessionStatus: "needs_input",
    });
    expect(sessionPatchFromOutput({ type: "plan_pending" })).toEqual({
      sessionStatus: "needs_input",
    });
  });

  it("returns connection patch for connection events", () => {
    const patch = sessionPatchFromOutput({
      type: "connection_lost",
      connection: { state: "disconnected" },
    });
    expect(patch?.connection).toEqual({ state: "disconnected" });
  });

  it("returns undefined for unknown subtypes", () => {
    expect(sessionPatchFromOutput({ type: "assistant" })).toBeUndefined();
  });
});

describe("shouldBumpSortTimestampForOutput", () => {
  it("returns true for question_pending and plan_pending", () => {
    expect(shouldBumpSortTimestampForOutput({ type: "question_pending" })).toBe(true);
    expect(shouldBumpSortTimestampForOutput({ type: "plan_pending" })).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(shouldBumpSortTimestampForOutput({ type: "assistant" })).toBe(false);
  });
});

describe("mergeGitCheckpoints", () => {
  const ckpt = (id: string, time: string): GitCheckpoint =>
    ({
      id,
      sessionGroupId: "g",
      commitSha: id,
      committedAt: time,
    }) as GitCheckpoint;

  it("merges by id and sorts newest first", () => {
    const merged = mergeGitCheckpoints(
      [ckpt("a", "2026-01-01T00:00:00.000Z")],
      ckpt("b", "2026-01-02T00:00:00.000Z"),
    );
    expect(merged.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("rewrites a checkpoint by replaced sha", () => {
    const result = rewriteGitCheckpoints(
      [ckpt("old", "2026-01-01T00:00:00.000Z")],
      "old",
      ckpt("new", "2026-01-02T00:00:00.000Z"),
    );
    expect(result.map((c) => c.commitSha)).toEqual(["new"]);
  });
});

describe("extractMessagePreview", () => {
  it("returns text from message_sent", () => {
    expect(extractMessagePreview("message_sent", { text: "hello" })).toBe("hello");
  });

  it("returns first text block from assistant payload", () => {
    expect(
      extractMessagePreview("session_output", {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use" },
            { type: "text", text: "hi there" },
          ],
        },
      }),
    ).toBe("hi there");
  });

  it("returns null for non-text payloads", () => {
    expect(extractMessagePreview("session_output", { type: "tool_result" })).toBeNull();
  });
});
