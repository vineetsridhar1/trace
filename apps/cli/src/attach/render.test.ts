import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import {
  eventScopeKey,
  handleSessionEvent,
  optimisticallyInsertSessionMessage,
  useAuthStore,
  useEntityStore,
} from "@trace/client-core/headless";
import { appendDelta, renderTranscriptLines } from "./render.js";

let counter = 0;

function makeEvent(
  eventType: string,
  payload: Record<string, unknown>,
  overrides: Partial<Event> = {},
): Event & { id: string } {
  counter += 1;
  return {
    id: `evt-${counter}`,
    scopeType: "session",
    scopeId: "sess-1",
    eventType,
    payload,
    actor: { type: "user", id: "user-1", name: "Alex", avatarUrl: null },
    parentId: null,
    timestamp: `2026-07-03T12:00:${String(counter).padStart(2, "0")}.000Z`,
    metadata: null,
    ...overrides,
  } as Event & { id: string };
}

function transcript(events: Array<Event & { id: string }>): string[] {
  const ids = events.map((event) => event.id);
  const byId = Object.fromEntries(events.map((event) => [event.id, event]));
  return renderTranscriptLines(ids, byId);
}

describe("renderTranscriptLines", () => {
  it("renders every node kind distinguishably", () => {
    const events = [
      makeEvent("message_sent", { text: "fix the login bug\nplease" }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Looking into it." },
            { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
          ],
        },
      }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "src/login.ts" } }],
        },
      }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "src/auth.ts" } }],
        },
      }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [
            {
              type: "plan",
              content: "1. Fix validation\n2. Add tests",
              filePath: "plans/login.md",
            },
          ],
        },
      }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [
            {
              type: "question",
              questions: [
                {
                  question: "Which approach?",
                  header: "Approach",
                  multiSelect: false,
                  options: [{ label: "Quick fix" }, { label: "Refactor" }],
                },
              ],
            },
          ],
        },
      }),
      makeEvent("session_pr_opened", { url: "https://github.com/o/r/pull/1" }),
    ];

    expect(transcript(events)).toMatchInlineSnapshot(`
      [
        "you > fix the login bug",
        "      please",
        "Looking into it.",
        "[tool] Bash pnpm test",
        "[read] src/login.ts",
        "[read] src/auth.ts",
        "[plan] plans/login.md",
        "  1. Fix validation",
        "  2. Add tests",
        "[question] Which approach?",
        "  (1) Quick fix",
        "  (2) Refactor",
        "[pr] opened https://github.com/o/r/pull/1",
      ]
    `);
  });

  it("skips hidden and empty outputs", () => {
    const events = [
      makeEvent("session_output", { type: "assistant", message: { content: [] } }),
      makeEvent("session_output", {
        type: "user",
        message: { content: [{ type: "tool_result", content: "ignored" }] },
      }),
    ];
    expect(transcript(events)).toEqual([]);
  });
});

describe("appendDelta", () => {
  it("returns only new lines when the transcript grows", () => {
    expect(appendDelta(["a", "b"], ["a", "b", "c", "d"])).toEqual(["c", "d"]);
  });

  it("re-emits from the divergence point when a tail node absorbed an event", () => {
    expect(appendDelta(["a", "b"], ["a", "B2", "c"])).toEqual(["B2", "c"]);
  });
});

describe("optimistic prompt echo", () => {
  it("reconciles the canonical event without duplication", () => {
    useAuthStore.setState({
      user: {
        id: "user-1",
        email: "a@b.c",
        name: "Alex",
      } as unknown as ReturnType<typeof useAuthStore.getState>["user"],
    });
    const sessionId = "sess-echo";
    const scopeKey = eventScopeKey("session", sessionId);

    const optimistic = optimisticallyInsertSessionMessage(sessionId, "hello agent");
    let bucket = useEntityStore.getState().eventsByScope[scopeKey] ?? {};
    expect(Object.keys(bucket)).toEqual([optimistic.eventId]);

    handleSessionEvent(
      sessionId,
      makeEvent("message_sent", {
        text: "hello agent",
        clientMutationId: optimistic.clientMutationId,
      }),
    );

    bucket = useEntityStore.getState().eventsByScope[scopeKey] ?? {};
    const ids = Object.keys(bucket);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(optimistic.eventId);
    const lines = renderTranscriptLines(
      useEntityStore.getState()._eventIdsByScope[scopeKey] ?? [],
      bucket,
    );
    expect(lines).toEqual(["you > hello agent"]);
  });
});
