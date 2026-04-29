import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { buildSessionNodes } from "../src/session/nodes.js";
import {
  extractSessionErrorMessage,
  statusRowForSessionOutput,
  statusRowForSessionTermination,
} from "../src/session/status-rows.js";

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

  it("still hides prompt-less session_started events without a move marker", () => {
    const event = makeEvent();

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([]);
  });

  it("keeps visible terminal and infrastructure events in chronological order", () => {
    const message = makeEvent({
      id: "message-1",
      eventType: "message_sent",
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: { text: "stop" },
    });
    const connectionLost = makeEvent({
      id: "connection-1",
      eventType: "session_output",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: { type: "connection_lost", reason: "runtime_disconnected" },
    });
    const recoveryFailed = makeEvent({
      id: "recovery-1",
      eventType: "session_output",
      timestamp: "2026-01-01T00:00:02.000Z",
      payload: {
        type: "recovery_failed",
        reason: "home_runtime_offline",
        connection: { lastError: "OD4MPKT-M is offline" },
      },
    });
    const terminated = makeEvent({
      id: "terminated-1",
      eventType: "session_terminated",
      timestamp: "2026-01-01T00:00:03.000Z",
      payload: { reason: "manual_stop", agentStatus: "done" },
    });

    const result = buildSessionNodes(
      [message.id, connectionLost.id, recoveryFailed.id, terminated.id],
      {
        [message.id]: message,
        [connectionLost.id]: connectionLost,
        [recoveryFailed.id]: recoveryFailed,
        [terminated.id]: terminated,
      },
    );

    expect(result.nodes).toEqual([
      { kind: "event", id: message.id },
      { kind: "event", id: connectionLost.id },
      { kind: "event", id: recoveryFailed.id },
      { kind: "event", id: terminated.id },
    ]);
  });

  it("does not dedupe error result events after successful result events", () => {
    const success = makeEvent({
      id: "result-1",
      eventType: "session_output",
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: { type: "result", subtype: "success" },
    });
    const error = makeEvent({
      id: "result-2",
      eventType: "session_output",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: { type: "result", subtype: "error" },
    });

    const result = buildSessionNodes([success.id, error.id], {
      [success.id]: success,
      [error.id]: error,
    });

    expect(result.nodes).toEqual([
      { kind: "event", id: success.id },
      { kind: "event", id: error.id },
    ]);
  });
});

describe("session status rows", () => {
  it("extracts nested JSON provider error messages", () => {
    const message = `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.5' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again."}}`;

    expect(extractSessionErrorMessage(message)).toBe(
      "The 'gpt-5.5' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.",
    );
  });

  it("extracts scalar error fields from nested JSON strings", () => {
    expect(extractSessionErrorMessage('{"type":"error","error":"adapter crashed"}')).toBe(
      "adapter crashed",
    );
  });

  it("labels output errors and error results as failed runs", () => {
    expect(statusRowForSessionOutput({ type: "error", message: "boom" })).toEqual({
      tone: "error",
      title: "Run failed",
      detail: "boom",
    });
    expect(statusRowForSessionOutput({ type: "result", subtype: "error" })).toEqual({
      tone: "error",
      title: "Run failed",
      detail: undefined,
    });
  });

  it("labels manual stops, workspace failures, and failed terminations", () => {
    expect(statusRowForSessionTermination({ reason: "manual_stop", agentStatus: "done" })).toEqual({
      tone: "stop",
      title: "Stopped by user",
    });
    expect(
      statusRowForSessionTermination({
        reason: "workspace_failed",
        agentStatus: "failed",
        error: "fatal: worktree conflict",
      }),
    ).toEqual({
      tone: "error",
      title: "Workspace setup failed",
      detail: "fatal: worktree conflict",
    });
    expect(statusRowForSessionTermination({ reason: "unknown", agentStatus: "failed" })).toEqual({
      tone: "error",
      title: "Session failed",
      detail: "unknown",
    });
  });
});
