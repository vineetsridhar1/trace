import { beforeEach, describe, expect, it } from "vitest";
import type { Event, EventType, Preview } from "@trace/gql";
import type { JsonObject } from "@trace/shared";
import { handleOrgEvent, handleSessionEvent } from "./handlers.js";
import { useEntityStore } from "../stores/entity.js";

function makePreview(overrides: Partial<Preview> = {}): Preview {
  return {
    __typename: "Preview",
    id: "preview-1",
    organizationId: "org-1",
    sessionId: "session-1",
    sessionGroupId: "group-1",
    createdByActorType: "user",
    createdByActorId: "user-1",
    command: "pnpm dev",
    cwd: "apps/web",
    port: 3000,
    visibility: "org",
    status: "ready",
    url: "https://preview.test/preview-1",
    routeId: "route-1",
    terminalId: "terminal-1",
    startedAt: "2026-05-03T10:00:00.000Z",
    stoppedAt: null,
    lastError: null,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(eventType: EventType, preview: Preview): Event {
  const payload = {
    preview: preview as unknown as JsonObject,
    status: preview.status,
    url: preview.url ?? null,
    error: preview.lastError ?? null,
  } satisfies JsonObject;

  return {
    __typename: "Event",
    id: `event-${eventType}`,
    eventType,
    scopeType: "session",
    scopeId: preview.sessionId,
    parentId: null,
    metadata: null,
    payload,
    timestamp: "2026-05-03T10:01:00.000Z",
    actor: { __typename: "Actor", id: "user-1", type: "user", name: "User", avatarUrl: null },
  };
}

describe("preview event handling", () => {
  beforeEach(() => {
    useEntityStore.getState().reset();
  });

  it("upserts previews from org events and indexes them by session", () => {
    const preview = makePreview();

    handleOrgEvent(makeEvent("preview_ready", preview));

    const state = useEntityStore.getState();
    expect(state.previews["preview-1"]).toMatchObject({ id: "preview-1", status: "ready" });
    expect(state._previewIdsBySession["session-1"]).toEqual(["preview-1"]);
  });

  it("updates preview status from session-scoped events", () => {
    const preview = makePreview({ status: "ready" });
    handleOrgEvent(makeEvent("preview_ready", preview));

    handleSessionEvent(
      "session-1",
      makeEvent(
        "preview_failed",
        makePreview({
          status: "failed",
          stoppedAt: "2026-05-03T10:02:00.000Z",
          lastError: "gateway unavailable",
        }),
      ),
    );

    const state = useEntityStore.getState();
    expect(state.previews["preview-1"]).toMatchObject({
      status: "failed",
      lastError: "gateway unavailable",
    });
    expect(state._previewIdsBySession["session-1"]).toEqual(["preview-1"]);
  });
});
