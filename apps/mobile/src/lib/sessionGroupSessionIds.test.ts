import { describe, expect, it } from "vitest";
import type { EntityState, SessionEntity } from "@trace/client-core";
import { selectSessionGroupSessionIds } from "./sessionGroupSessionIds";

function session(overrides: Partial<SessionEntity> & { id: string }): SessionEntity {
  const { id, ...rest } = overrides;
  return {
    id,
    name: id,
    role: "primary",
    agentStatus: "done",
    sessionStatus: "in_progress",
    sessionGroupId: "group-1",
    createdAt: "2026-04-25T10:00:00.000Z",
    updatedAt: "2026-04-25T10:00:00.000Z",
    ...rest,
  } as SessionEntity;
}

function stateWithSessions(sessions: SessionEntity[]): EntityState {
  return {
    sessions: Object.fromEntries(sessions.map((item) => [item.id, item])),
    _sessionIdsByGroup: {
      "group-1": sessions.map((item) => item.id),
    },
  } as unknown as EntityState;
}

describe("selectSessionGroupSessionIds", () => {
  it("omits controller-run sessions from mobile session tabs", () => {
    const state = stateWithSessions([
      session({
        id: "session-primary",
        role: "primary",
        updatedAt: "2026-04-25T10:01:00.000Z",
      }),
      session({
        id: "session-controller",
        role: "ultraplan_controller_run",
        updatedAt: "2026-04-25T10:05:00.000Z",
      }),
      session({
        id: "session-worker",
        role: "ticket_worker",
        updatedAt: "2026-04-25T10:03:00.000Z",
      }),
    ]);

    expect(selectSessionGroupSessionIds(state, "group-1")).toEqual([
      "session-worker",
      "session-primary",
    ]);
  });
});
