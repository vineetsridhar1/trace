import { describe, expect, it } from "vitest";
import {
  canAutoRecoverToolFailure,
  classifyToolFailure,
  isMeaningfulToolOutput,
  type ToolFailureEvidence,
} from "../src/index.js";

function evidence(overrides: Partial<ToolFailureEvidence> = {}): ToolFailureEvidence {
  return {
    provider: "claude_code",
    operation: "resume",
    source: "provider_event",
    message: "Provider request failed",
    ...overrides,
  };
}

describe("classifyToolFailure", () => {
  it("prefers exact provider codes over message matching", () => {
    expect(
      classifyToolFailure(
        evidence({
          providerCode: "RATE_LIMIT_EXCEEDED",
          message: "No conversation found with session ID stale-session",
        }),
      ),
    ).toMatchObject({
      kind: "rate_limited",
      confidence: "exact",
      retryable: true,
      matchedRule: "provider_code.rate_limit_exceeded",
    });
  });

  it.each([
    [401, "authentication_required", false],
    [403, "permission_denied", false],
    [429, "rate_limited", true],
    [503, "service_unavailable", true],
  ] as const)("classifies HTTP status %i", (httpStatus, kind, retryable) => {
    expect(classifyToolFailure(evidence({ httpStatus }))).toMatchObject({
      kind,
      confidence: "exact",
      retryable,
    });
  });

  it("classifies process metadata without parsing prose", () => {
    expect(classifyToolFailure(evidence({ processCode: "ENOENT" }))).toMatchObject({
      kind: "tool_missing",
      confidence: "exact",
      matchedRule: "process_code.enoent",
    });
  });

  it.each([
    ["claude_code", "No conversation found with session ID: stale-session"],
    ["codex", "thread/resume failed: no rollout found for thread id stale-thread"],
  ])("recognizes a %s missing conversation while resuming", (provider, message) => {
    expect(classifyToolFailure(evidence({ provider, message }))).toMatchObject({
      kind: "conversation_missing",
      confidence: "strong",
      retryable: false,
      matchedRule: `${provider}.resume.conversation_missing`,
    });
  });

  it("does not apply resume rules to a fresh run", () => {
    expect(
      classifyToolFailure(
        evidence({
          operation: "run",
          message: "No conversation found with session ID: stale-session",
        }),
      ),
    ).toMatchObject({ kind: "unknown", confidence: "unknown" });
  });

  it.each(["File not found", "Session completed unsuccessfully", "Unexpected provider failure"])(
    "keeps ambiguous messages unknown: %s",
    (message) => {
      expect(classifyToolFailure(evidence({ message }))).toMatchObject({
        kind: "unknown",
        confidence: "unknown",
        retryable: false,
      });
    },
  );
});

describe("isMeaningfulToolOutput", () => {
  it("does not treat control-only failure output as progress", () => {
    expect(isMeaningfulToolOutput({ type: "result", subtype: "error" })).toBe(false);
    expect(
      isMeaningfulToolOutput({
        type: "usage",
        usage: {
          inputTokens: 1,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }),
    ).toBe(false);
    expect(isMeaningfulToolOutput({ type: "error", message: "failed" })).toBe(false);
  });

  it("treats assistant content and successful completion as progress", () => {
    expect(
      isMeaningfulToolOutput({
        type: "assistant",
        message: { content: [{ type: "text", text: "Working on it" }] },
      }),
    ).toBe(true);
    expect(isMeaningfulToolOutput({ type: "result", subtype: "success" })).toBe(true);
  });
});

describe("canAutoRecoverToolFailure", () => {
  const missingConversation = classifyToolFailure(
    evidence({ message: "No conversation found with session ID: stale-session" }),
  );

  it("allows recovery after control-only error output", () => {
    const hasMeaningfulOutput = isMeaningfulToolOutput({ type: "result", subtype: "error" });
    expect(canAutoRecoverToolFailure(missingConversation, hasMeaningfulOutput)).toBe(true);
  });

  it("blocks replay after meaningful output", () => {
    expect(canAutoRecoverToolFailure(missingConversation, true)).toBe(false);
  });

  it("does not recover unknown failures", () => {
    const unknown = classifyToolFailure(evidence({ message: "Unexpected provider failure" }));
    expect(canAutoRecoverToolFailure(unknown, false)).toBe(false);
  });
});
