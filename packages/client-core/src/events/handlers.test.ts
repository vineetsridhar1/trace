import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@trace/gql";
import { useEntityStore, type SessionEntity } from "../stores/entity.js";
import { handleOrgEvent } from "./handlers.js";
import { _resetOrgEventUIBindings, setOrgEventUIBindings } from "./ui-bindings.js";

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

function event(overrides: Partial<Event> & Pick<Event, "eventType" | "scopeId">): Event {
  const { eventType, scopeId, ...rest } = overrides;
  return {
    id: `event-${eventType}-${scopeId}`,
    eventType,
    scopeType: "session",
    scopeId,
    timestamp: "2026-04-25T10:01:00.000Z",
    payload: {},
    actor: { id: "system", type: "system" },
    ...rest,
  } as Event;
}

describe("handleOrgEvent session visibility", () => {
  beforeEach(() => {
    useEntityStore.getState().reset();
  });

  afterEach(() => {
    _resetOrgEventUIBindings();
    useEntityStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("does not select controller-run sessions after deleting the active session", () => {
    useEntityStore.getState().upsertMany("sessions", [
      session({ id: "session-active", sessionGroupId: "group-1" }),
      session({
        id: "session-controller",
        role: "ultraplan_controller_run",
        sessionGroupId: "group-1",
        updatedAt: "2026-04-25T10:05:00.000Z",
      }),
      session({
        id: "session-worker",
        role: "ticket_worker",
        sessionGroupId: "group-1",
        updatedAt: "2026-04-25T10:02:00.000Z",
      }),
    ]);

    const setActiveSessionId = vi.fn();
    setOrgEventUIBindings({
      getActiveChannelId: () => null,
      getActiveSessionId: () => "session-active",
      getActiveSessionGroupId: () => "group-1",
      setActiveChannelId: vi.fn(),
      setActiveSessionId,
      setActiveSessionGroupId: vi.fn(),
      markChannelDone: vi.fn(),
      markSessionDone: vi.fn(),
      markSessionGroupDone: vi.fn(),
      openSessionTab: vi.fn(),
      navigateToSession: vi.fn(),
    });

    handleOrgEvent(
      event({
        eventType: "session_deleted",
        scopeId: "session-active",
        payload: { sessionGroupId: "group-1" },
      }),
    );

    expect(setActiveSessionId).toHaveBeenCalledWith("session-worker");
  });

  it("does not mark done badges for controller-run session status events", () => {
    useEntityStore
      .getState()
      .upsert(
        "sessions",
        "session-controller",
        session({ id: "session-controller", role: "ultraplan_controller_run" }),
      );

    const markSessionDone = vi.fn();
    const markSessionGroupDone = vi.fn();
    setOrgEventUIBindings({
      getActiveChannelId: () => null,
      getActiveSessionId: () => null,
      getActiveSessionGroupId: () => null,
      setActiveChannelId: vi.fn(),
      setActiveSessionId: vi.fn(),
      setActiveSessionGroupId: vi.fn(),
      markChannelDone: vi.fn(),
      markSessionDone,
      markSessionGroupDone,
      openSessionTab: vi.fn(),
      navigateToSession: vi.fn(),
    });

    handleOrgEvent(
      event({
        eventType: "session_terminated",
        scopeId: "session-controller",
        payload: { agentStatus: "failed", sessionStatus: "in_progress" },
      }),
    );

    expect(markSessionDone).not.toHaveBeenCalled();
    expect(markSessionGroupDone).not.toHaveBeenCalled();
  });

  it("hydrates active Ultraplan state onto its session group", () => {
    useEntityStore.getState().upsert("sessionGroups", "group-1", {
      id: "group-1",
      name: "Group",
      slug: "group",
      status: "active",
      createdAt: "2026-04-25T10:00:00.000Z",
      updatedAt: "2026-04-25T10:00:00.000Z",
    } as never);

    handleOrgEvent(
      event({
        eventType: "ultraplan_created",
        scopeType: "ultraplan",
        scopeId: "ultra-1",
        payload: {
          sessionGroupId: "group-1",
          ultraplan: {
            id: "ultra-1",
            sessionGroupId: "group-1",
            status: "planning",
            planSummary: "Ship the workflow",
            updatedAt: "2026-04-25T10:02:00.000Z",
          },
        },
      }),
    );

    expect(useEntityStore.getState().sessionGroups["group-1"]).toMatchObject({
      updatedAt: "2026-04-25T10:02:00.000Z",
      ultraplan: {
        id: "ultra-1",
        status: "planning",
        planSummary: "Ship the workflow",
      },
    });
  });

  it("hydrates Ultraplan state when the session group is not in the store yet", () => {
    handleOrgEvent(
      event({
        eventType: "ultraplan_created",
        scopeType: "ultraplan",
        scopeId: "ultra-1",
        payload: {
          sessionGroupId: "group-1",
          ultraplan: {
            id: "ultra-1",
            sessionGroupId: "group-1",
            status: "planning",
            planSummary: "Ship the workflow",
            updatedAt: "2026-04-25T10:02:00.000Z",
          },
        },
      }),
    );

    expect(useEntityStore.getState().sessionGroups["group-1"]).toMatchObject({
      id: "group-1",
      updatedAt: "2026-04-25T10:02:00.000Z",
      ultraplan: {
        id: "ultra-1",
        status: "planning",
        planSummary: "Ship the workflow",
      },
    });
  });

  it("updates hydrated controller runs on Ultraplan run events", () => {
    useEntityStore.getState().upsert("sessionGroups", "group-1", {
      id: "group-1",
      name: "Group",
      slug: "group",
      status: "active",
      createdAt: "2026-04-25T10:00:00.000Z",
      updatedAt: "2026-04-25T10:00:00.000Z",
      ultraplan: {
        id: "ultra-1",
        status: "planning",
        controllerRuns: [{ id: "run-1", status: "queued", sessionGroupId: "group-1" }],
      },
    } as never);

    handleOrgEvent(
      event({
        eventType: "ultraplan_controller_run_started",
        scopeType: "ultraplan",
        scopeId: "ultra-1",
        payload: {
          ultraplanId: "ultra-1",
          controllerRun: {
            id: "run-1",
            ultraplanId: "ultra-1",
            sessionGroupId: "group-1",
            status: "running",
            summary: null,
          },
        },
      }),
    );

    expect(useEntityStore.getState().sessionGroups["group-1"]).toMatchObject({
      ultraplan: {
        lastControllerRunId: "run-1",
        controllerRuns: [{ id: "run-1", status: "running" }],
      },
    });
  });
});
