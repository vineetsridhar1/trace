import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntityState, SessionEntity } from "@trace/client-core";
import { buildHomeSections } from "./useHomeSections";

function session(
  fields: Partial<SessionEntity> & { id: string; sessionGroupId: string },
): SessionEntity {
  const { id, sessionGroupId, ...rest } = fields;
  return {
    id,
    name: id,
    sessionGroupId,
    createdBy: { id: "user_1" },
    agentStatus: "done",
    sessionStatus: "completed",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    ...rest,
  } as unknown as SessionEntity;
}

function stateWithSessions(sessions: SessionEntity[]): EntityState {
  return {
    sessions: Object.fromEntries(sessions.map((item) => [item.id, item])),
    sessionGroups: {},
    eventsByScope: {},
  } as unknown as EntityState;
}

describe("buildHomeSections", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sorts recently done groups by the timestamp shown in the row", () => {
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));

    const result = buildHomeSections(
      stateWithSessions([
        session({
          id: "session_old_update_recent_message",
          sessionGroupId: "group_recent_message",
          lastMessageAt: "2026-04-26T11:58:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
        }),
        session({
          id: "session_recent_update",
          sessionGroupId: "group_recent_update",
          updatedAt: "2026-04-26T10:00:00.000Z",
        }),
        session({
          id: "session_sort_only_recent",
          sessionGroupId: "group_sort_only_recent",
          lastMessageAt: "2026-04-26T09:00:00.000Z",
          updatedAt: "2026-04-26T09:00:00.000Z",
          _sortTimestamp: "2026-04-26T11:59:00.000Z",
        }),
      ]),
      "user_1",
      null,
    );

    expect(result.sections).toEqual([
      {
        kind: "recently_done",
        ids: ["group_recent_message", "group_recent_update", "group_sort_only_recent"],
      },
    ]);
  });
});
