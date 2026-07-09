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

  it("turns completed design PDF exports into timeline nodes", () => {
    const event = makeEvent({
      eventType: "design_export_completed",
      payload: {
        artifactId: "artifact-1",
        exportType: "pdf",
        status: "completed",
        fileName: "Dashboard.pdf",
        fileId: "uploads/org-1/export-1-Dashboard.pdf",
        fileUrl: "https://files.example/Dashboard.pdf",
        byteSize: 2048,
        pageCount: 3,
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([
      {
        kind: "design-export",
        id: event.id,
        artifactId: "artifact-1",
        status: "completed",
        exportType: "pdf",
        fileId: "uploads/org-1/export-1-Dashboard.pdf",
        fileName: "Dashboard.pdf",
        fileUrl: "https://files.example/Dashboard.pdf",
        byteSize: 2048,
        pageCount: 3,
        error: undefined,
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("turns failed design PDF exports into timeline nodes", () => {
    const event = makeEvent({
      eventType: "design_export_completed",
      payload: {
        artifactId: "artifact-1",
        exportType: "pdf",
        status: "failed",
        error: "Chromium failed",
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([
      expect.objectContaining({
        kind: "design-export",
        id: event.id,
        artifactId: "artifact-1",
        status: "failed",
        exportType: "pdf",
        error: "Chromium failed",
      }),
    ]);
  });
});
