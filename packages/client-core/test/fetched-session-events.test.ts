import type { Event } from "@trace/gql";
import { beforeEach, describe, expect, it } from "vitest";
import { upsertFetchedSessionEventsWithOptimisticResolution } from "../src/mutations/optimistic-message.js";
import { useEntityStore } from "../src/stores/entity.js";

describe("upsertFetchedSessionEventsWithOptimisticResolution", () => {
  beforeEach(() => useEntityStore.getState().reset());

  it("hydrates artifacts from historical session events", () => {
    const artifact = {
      id: "artifact-1",
      organizationId: "org-1",
      sessionId: "session-1",
      type: "trace.video.v1",
      key: "browser-proof",
      bundleDigest: "sha256:bundle",
      byteSize: 1024,
      createdAt: "2026-08-25T00:00:00.000Z",
      manifest: {
        schemaVersion: 1,
        files: [
          {
            path: "browser-proof.webm",
            mediaType: "video/webm",
            size: 1024,
            digest: "sha256:file",
          },
        ],
      },
    };
    const event = {
      id: "event-1",
      scopeType: "session",
      scopeId: "session-1",
      eventType: "artifact_created",
      payload: { artifact },
      actor: { type: "agent", id: "agent-1", name: null, avatarUrl: null },
      parentId: null,
      timestamp: "2026-08-25T00:00:00.000Z",
      metadata: null,
    } as Event;

    upsertFetchedSessionEventsWithOptimisticResolution("session-1", [event]);

    expect(useEntityStore.getState().artifacts[artifact.id]).toEqual(artifact);
    expect(useEntityStore.getState().eventsByScope["session:session-1"]?.[event.id]).toEqual(event);
  });
});
