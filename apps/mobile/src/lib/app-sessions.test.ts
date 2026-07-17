import { describe, expect, it } from "vitest";
import type { EntityState } from "@trace/client-core";
import type { SessionApplicationProcess, SessionEndpoint } from "@trace/gql";
import {
  appSessionSubtitle,
  buildAppSessionGroupIds,
  buildDesignSessionGroupIds,
  findReadyAppPreviewUrl,
  findReadyAppPreviewEndpointId,
} from "./app-sessions";

function stateWithGroups(sessionGroups: Record<string, Record<string, unknown>>): EntityState {
  return { sessionGroups } as unknown as EntityState;
}

function endpoint(overrides: Record<string, unknown> = {}): SessionEndpoint {
  return {
    id: "endpoint",
    sessionGroupId: "group",
    appConfigId: "app",
    processConfigId: "web",
    status: "enabled",
    url: "https://preview.example.com",
    ...overrides,
  } as unknown as SessionEndpoint;
}

function process(overrides: Record<string, unknown> = {}): SessionApplicationProcess {
  return {
    id: "process",
    sessionGroupId: "group",
    appConfigId: "app",
    processConfigId: "web",
    status: "running",
    ...overrides,
  } as unknown as SessionApplicationProcess;
}

describe("buildAppSessionGroupIds", () => {
  it("returns active app groups newest first", () => {
    const state = stateWithGroups({
      coding: { id: "coding", kind: "coding", status: "in_progress" },
      older: {
        id: "older",
        kind: "app",
        status: "in_progress",
        updatedAt: "2026-07-10T12:00:00.000Z",
      },
      newer: {
        id: "newer",
        kind: "app",
        status: "needs_input",
        updatedAt: "2026-07-11T12:00:00.000Z",
      },
    });

    expect(buildAppSessionGroupIds(state)).toEqual(["newer", "older"]);
  });

  it("excludes archived app groups", () => {
    const state = stateWithGroups({
      archivedAt: {
        id: "archivedAt",
        kind: "app",
        status: "in_progress",
        archivedAt: "2026-07-11T12:00:00.000Z",
      },
      archivedStatus: { id: "archivedStatus", kind: "app", status: "archived" },
      active: { id: "active", kind: "app", status: "stopped" },
    });

    expect(buildAppSessionGroupIds(state)).toEqual(["active"]);
  });
});

describe("buildDesignSessionGroupIds", () => {
  it("returns only active design groups newest first", () => {
    const state = stateWithGroups({
      app: { id: "app", kind: "app", status: "in_progress" },
      older: {
        id: "older",
        kind: "design",
        status: "in_progress",
        updatedAt: "2026-07-10T12:00:00.000Z",
      },
      newer: {
        id: "newer",
        kind: "design",
        status: "needs_input",
        updatedAt: "2026-07-11T12:00:00.000Z",
      },
      archived: { id: "archived", kind: "design", status: "archived" },
    });

    expect(buildDesignSessionGroupIds(state)).toEqual(["newer", "older"]);
  });
});

describe("appSessionSubtitle", () => {
  it("prioritizes actionable and active states over event previews", () => {
    expect(
      appSessionSubtitle({ agentStatus: "active", preview: "Old preview", status: "needs_input" }),
    ).toBe("Needs your input");
    expect(
      appSessionSubtitle({ agentStatus: "active", preview: "Old preview", status: "in_progress" }),
    ).toBe("Building now");
  });

  it("uses the latest preview when the application is idle", () => {
    expect(
      appSessionSubtitle({
        agentStatus: "done",
        preview: "Added the dashboard",
        status: "in_review",
      }),
    ).toBe("Added the dashboard");
  });
});

describe("findReadyAppPreviewUrl", () => {
  it("returns an enabled endpoint for a running process", () => {
    expect(findReadyAppPreviewUrl("group", [endpoint()], [process()])).toBe(
      "https://preview.example.com",
    );
  });

  it("ignores endpoints whose process is not running", () => {
    expect(
      findReadyAppPreviewUrl("group", [endpoint()], [process({ status: "starting" })]),
    ).toBeNull();
  });

  it("does not use an endpoint from another application", () => {
    expect(
      findReadyAppPreviewUrl("group", [endpoint()], [process({ appConfigId: "other" })]),
    ).toBeNull();
  });
});

describe("findReadyAppPreviewEndpointId", () => {
  it("returns the running endpoint ID used to create a preview credential", () => {
    expect(findReadyAppPreviewEndpointId("group", [endpoint()], [process()])).toBe("endpoint");
  });
});
