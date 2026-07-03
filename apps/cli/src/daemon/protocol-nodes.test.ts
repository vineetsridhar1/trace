import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { toProtocolNodes } from "./protocol-nodes.js";

let counter = 0;

function makeEvent(eventType: string, payload: Record<string, unknown>): Event & { id: string } {
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
  } as Event & { id: string };
}

function nodesFor(events: Array<Event & { id: string }>) {
  return toProtocolNodes(
    events.map((event) => event.id),
    Object.fromEntries(events.map((event) => [event.id, event])),
  );
}

describe("toProtocolNodes", () => {
  it("maps every node kind to a render-ready protocol node", () => {
    counter = 0;
    const events = [
      makeEvent("message_sent", { text: "fix the login bug" }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "On it." },
            { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
          ],
        },
      }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "a.ts" } }],
        },
      }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "b.ts" } }],
        },
      }),
      makeEvent("session_output", {
        type: "assistant",
        message: {
          content: [{ type: "plan", content: "1. do it", filePath: "plan.md" }],
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
                  question: "Proceed?",
                  header: "Go",
                  multiSelect: false,
                  options: [{ label: "Yes" }],
                },
              ],
            },
          ],
        },
      }),
      makeEvent("session_pr_opened", { url: "https://github.com/o/r/pull/2" }),
      makeEvent("session_output", { type: "error", message: "runtime lost" }),
    ];

    const kinds = nodesFor(events).map((node) => node.kind);
    expect(kinds).toEqual([
      "user_prompt",
      "agent_text",
      "tool_use",
      "read_group",
      "plan",
      "question",
      "pr",
      "error",
    ]);
  });

  it("marks optimistic prompts and strips wrapping", () => {
    counter = 0;
    const optimistic = {
      ...makeEvent("message_sent", { text: "hello" }),
      id: "optimistic:abc",
    };
    const nodes = toProtocolNodes([optimistic.id], { [optimistic.id]: optimistic });
    expect(nodes).toEqual([
      {
        id: "optimistic:abc",
        kind: "user_prompt",
        text: "hello",
        timestamp: optimistic.timestamp,
        optimistic: true,
      },
    ]);
  });
});
