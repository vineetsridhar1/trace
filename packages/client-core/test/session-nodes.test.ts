import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { buildSessionNodes } from "../src/session/nodes.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    scopeType: "session",
    scopeId: "session-1",
    eventType: "session_started",
    actorType: "user",
    actorId: "user-1",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: {},
    payload: {},
    organizationId: "org-1",
    ...overrides,
  } as Event;
}

describe("buildSessionNodes", () => {
  it("keeps runtime start failures that carry an actionable artifact", () => {
    const event = makeEvent({
      eventType: "session_runtime_start_failed",
      payload: {
        artifact: {
          kind: "credential_required",
          provider: "openai",
          title: "Connect Codex",
          description: "Add a credential.",
        },
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([{ kind: "event", id: event.id }]);
  });

  it("coalesces repeated recovery artifacts until the user sends another message", () => {
    const artifact = {
      kind: "login_required" as const,
      provider: "codex" as const,
      title: "Sign in to Codex",
      description: "This local runtime needs a Codex login to continue.",
    };
    const first = makeEvent({
      id: "codex-login-1",
      eventType: "session_output",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: { type: "error", artifact },
    });
    const retry = makeEvent({
      id: "codex-login-2",
      eventType: "session_output",
      timestamp: "2026-01-01T00:00:02.000Z",
      payload: { type: "error", artifact },
    });
    const userMessage = makeEvent({
      id: "user-retry",
      eventType: "message_sent",
      timestamp: "2026-01-01T00:00:03.000Z",
      payload: { text: "Try again" },
    });
    const retryAfterMessage = makeEvent({
      id: "codex-login-3",
      eventType: "session_output",
      timestamp: "2026-01-01T00:00:04.000Z",
      payload: { type: "error", artifact },
    });
    const events = {
      [first.id]: first,
      [retry.id]: retry,
      [userMessage.id]: userMessage,
      [retryAfterMessage.id]: retryAfterMessage,
    };

    const result = buildSessionNodes(
      [first.id, retry.id, userMessage.id, retryAfterMessage.id],
      events,
    );

    expect(result.nodes).toEqual([
      { kind: "event", id: first.id, repeatCount: 2 },
      { kind: "event", id: userMessage.id },
      { kind: "event", id: retryAfterMessage.id, repeatCount: 1 },
    ]);
  });

  it("renders legacy assistant events with a recovery marker as normal assistant output", () => {
    const event = makeEvent({
      eventType: "session_output",
      payload: {
        type: "assistant",
        artifact: {
          kind: "login_required",
          provider: "codex",
          title: "Sign in to Codex",
          description: "This local runtime needs a Codex login to continue.",
        },
        message: { content: [{ type: "text", text: "Run `codex login`." }] },
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([{ kind: "event", id: event.id }]);
  });

  it("hides the redundant workspace failure after an actionable runtime failure", () => {
    const recovery = makeEvent({
      id: "cloud-credential-error",
      eventType: "session_runtime_start_failed",
      payload: {
        artifact: {
          kind: "credential_required",
          provider: "anthropic",
          title: "Connect Anthropic",
          description: "Add an API key.",
        },
      },
    });
    const workspaceFailure = makeEvent({
      id: "workspace-failed",
      eventType: "session_output",
      payload: { type: "workspace_failed", error: "Cloud launcher failed" },
    });

    const result = buildSessionNodes(
      [recovery.id, workspaceFailure.id],
      { [recovery.id]: recovery, [workspaceFailure.id]: workspaceFailure },
    );

    expect(result.nodes).toEqual([{ kind: "event", id: recovery.id }]);
  });

  it("continues hiding ordinary runtime start failures", () => {
    const event = makeEvent({ eventType: "session_runtime_start_failed", payload: {} });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([]);
  });

  it("keeps runtime move markers even without a prompt", () => {
    const event = makeEvent({
      payload: {
        type: "runtime_move",
        targetHosting: "cloud",
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([{ kind: "event", id: event.id }]);
  });

  it("keeps attachment-only session_started events", () => {
    const event = makeEvent({
      payload: {
        prompt: "",
        attachmentKeys: ["uploads/org-1/image.png"],
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([{ kind: "event", id: event.id }]);
  });

  it("still hides prompt-less session_started events without a move marker", () => {
    const event = makeEvent();

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([]);
  });

  it("hides ordinary workspace_ready events", () => {
    const event = makeEvent({
      eventType: "session_output",
      payload: {
        type: "workspace_ready",
        workdir: "/tmp/work",
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([]);
  });

  it("hides raw usage events", () => {
    const event = makeEvent({
      eventType: "session_output",
      payload: {
        type: "usage",
        usage: {
          inputTokens: 600,
          outputTokens: 25,
          cacheReadTokens: 400,
          cacheCreationTokens: 0,
        },
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([]);
  });

  it("keeps workspace_restored_from_base warning events", () => {
    const event = makeEvent({
      eventType: "session_output",
      payload: {
        type: "workspace_restored_from_base",
        branch: "trace/missing",
        baseBranch: "develop",
        message:
          "Branch trace/missing did not exist on origin, so Trace created it from develop. Local-only changes from the previous workspace were not restored.",
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([{ kind: "event", id: event.id }]);
  });

  it("keeps visual plan artifact events in the session timeline", () => {
    const event = makeEvent({
      eventType: "artifact_created",
      payload: {
        artifact: {
          id: "artifact-1",
          type: "trace.visual-plan.v1",
        },
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([{ kind: "event", id: event.id }]);
  });

  it("turns trace request-input text into a structured question node", () => {
    const event = makeEvent({
      eventType: "session_output",
      payload: {
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: `Before I continue:
                <trace:request-input id="surface" type="single-select">
                  <context>Density follows the chosen platform.</context>
                  <question>Which surface should I design?</question>
                  <option id="web">Responsive web</option>
                  <option id="mobile">Native mobile</option>
                </trace:request-input>`,
            },
          ],
        },
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([
      {
        kind: "ask-user-question",
        id: event.id,
        timestamp: event.timestamp,
        leadingText: "Before I continue:",
        questions: [
          expect.objectContaining({
            id: "surface",
            type: "single-select",
            protocol: "trace",
            question: "Which surface should I design?",
          }),
        ],
      },
    ]);
  });

  it("keeps text blocks that precede a native question", () => {
    const event = makeEvent({
      eventType: "session_output",
      payload: {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "This choice changes the implementation." },
            {
              type: "question",
              questions: [{ id: "proceed", question: "Should I continue?", options: [] }],
            },
          ],
        },
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes[0]).toMatchObject({
      kind: "ask-user-question",
      leadingText: "This choice changes the implementation.",
    });
  });
});
