import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorType } from "@trace/gql";
import type { Preview } from "@prisma/client";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    getRuntimeForSession: vi.fn(),
  },
}));

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    startLongRunningProcess: vi.fn().mockReturnValue("terminal-1"),
    destroyTerminal: vi.fn(),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { eventService } from "./event.js";
import { PreviewService } from "./preview.js";
import type { PreviewGatewayAdapter } from "../lib/preview-gateway.js";

type MockedDeep<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K] extends object
      ? MockedDeep<T[K]>
      : T[K];
};

const prismaMock = prisma as unknown as MockedDeep<typeof prisma>;
const sessionRouterMock = sessionRouter as unknown as MockedDeep<typeof sessionRouter>;
const terminalRelayMock = terminalRelay as unknown as MockedDeep<typeof terminalRelay>;
const eventServiceMock = eventService as unknown as MockedDeep<typeof eventService>;

const gateway: PreviewGatewayAdapter = {
  createRoute: vi.fn().mockResolvedValue({ routeId: "route-1", url: "https://preview.test/p1" }),
  revokeRoute: vi.fn().mockResolvedValue(undefined),
};
const gatewayMock = gateway as MockedDeep<PreviewGatewayAdapter>;

function makePreview(overrides: Partial<Preview> = {}): Preview {
  return {
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
    status: "starting",
    url: null,
    routeId: null,
    terminalId: null,
    startedAt: null,
    stoppedAt: null,
    lastError: null,
    createdAt: new Date("2026-05-03T10:00:00.000Z"),
    updatedAt: new Date("2026-05-03T10:00:00.000Z"),
    ...overrides,
  };
}

function makeService() {
  return new PreviewService(gateway);
}

function openCloudRuntime() {
  return {
    id: "runtime-1",
    key: "org-1:runtime-1",
    label: "Cloud",
    ws: { readyState: 1, OPEN: 1 },
    hostingMode: "cloud",
    organizationId: "org-1",
    supportedTools: ["codex"],
    registeredRepoIds: [],
    lastHeartbeat: Date.now(),
    boundSessions: new Set<string>(),
    linkedCheckouts: new Map(),
  };
}

function createInput(actorType: ActorType = "user") {
  return {
    organizationId: "org-1",
    actorType,
    actorId: actorType === "agent" ? "agent-1" : "user-1",
    data: {
      sessionId: "session-1",
      command: "pnpm dev",
      cwd: "apps/web",
      port: 3000,
      visibility: "org" as const,
    },
  };
}

describe("PreviewService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gatewayMock.createRoute.mockResolvedValue({
      routeId: "route-1",
      url: "https://preview.test/p1",
    });
    gatewayMock.revokeRoute.mockResolvedValue(undefined);
    sessionRouterMock.getRuntime.mockReturnValue(openCloudRuntime());
    sessionRouterMock.getRuntimeForSession.mockReturnValue(undefined);
    terminalRelayMock.startLongRunningProcess.mockReturnValue("terminal-1");
    eventServiceMock.create.mockResolvedValue({ id: "event-1" });
    prismaMock.preview.findFirst.mockResolvedValue(null);
    prismaMock.session.findFirst.mockResolvedValue({
      id: "session-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      hosting: "cloud",
      connection: { runtimeInstanceId: "runtime-1" },
    });
    prismaMock.preview.create.mockResolvedValue(makePreview());
    prismaMock.preview.update.mockImplementation(async ({ data }) => makePreview(data));
  });

  it("rejects local sessions", async () => {
    prismaMock.session.findFirst.mockResolvedValueOnce({
      id: "session-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      hosting: "local",
      connection: { runtimeInstanceId: "runtime-1" },
    });

    await expect(makeService().createPreview(createInput())).rejects.toThrow(
      "Preview links are only available for cloud sessions",
    );
  });

  it("rejects invalid input before creating a preview", async () => {
    await expect(
      makeService().createPreview({
        ...createInput(),
        data: { ...createInput().data, command: " ", port: 70000 },
      }),
    ).rejects.toThrow("Preview command is required");

    expect(prismaMock.preview.create).not.toHaveBeenCalled();
  });

  it("starts a preview process, creates a route, and emits full lifecycle events", async () => {
    const created = makePreview();
    const processStarted = makePreview({ terminalId: "terminal-1", startedAt: new Date() });
    const ready = makePreview({
      status: "ready",
      terminalId: "terminal-1",
      routeId: "route-1",
      url: "https://preview.test/p1",
      startedAt: new Date(),
    });
    prismaMock.preview.create.mockResolvedValueOnce(created);
    prismaMock.preview.update.mockResolvedValueOnce(processStarted).mockResolvedValueOnce(ready);

    const result = await makeService().createPreview(createInput("agent"));

    expect(result.status).toBe("ready");
    expect(prismaMock.preview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByActorType: "agent",
          createdByActorId: "agent-1",
        }),
      }),
    );
    expect(terminalRelayMock.startLongRunningProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        runtimeInstanceId: "runtime-1",
        command: "pnpm dev",
      }),
    );
    expect(gatewayMock.createRoute).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1", port: 3000 }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledTimes(3);
    expect(eventServiceMock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: "preview_ready",
        payload: expect.objectContaining({
          preview: expect.objectContaining({ id: "preview-1", status: "ready" }),
          url: "https://preview.test/p1",
        }),
      }),
    );
  });

  it("maps active-preview unique constraint failures to validation errors", async () => {
    prismaMock.preview.create.mockRejectedValueOnce({ code: "P2002" });

    await expect(makeService().createPreview(createInput())).rejects.toThrow(
      "This session already has an active preview",
    );
  });

  it("best-effort stops terminal even when route revocation fails", async () => {
    const ready = makePreview({
      status: "ready",
      routeId: "route-1",
      terminalId: "terminal-1",
      url: "https://preview.test/p1",
    });
    gatewayMock.revokeRoute.mockRejectedValueOnce(new Error("gateway unavailable"));
    prismaMock.preview.findFirst.mockResolvedValueOnce(ready);
    prismaMock.preview.update
      .mockResolvedValueOnce(makePreview({ ...ready, status: "stopping" }))
      .mockResolvedValueOnce(
        makePreview({ ...ready, status: "failed", lastError: "gateway unavailable" }),
      );

    const result = await makeService().stopPreview({
      id: "preview-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(terminalRelayMock.destroyTerminal).toHaveBeenCalledWith("terminal-1");
    expect(result.status).toBe("failed");
    expect(eventServiceMock.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventType: "preview_failed" }),
    );
  });

  it("stops all active previews for a session group", async () => {
    const first = makePreview({ id: "preview-1", routeId: "route-1", terminalId: "terminal-1" });
    const second = makePreview({ id: "preview-2", routeId: "route-2", terminalId: "terminal-2" });
    const rows = new Map([
      [first.id, first],
      [second.id, second],
    ]);
    prismaMock.preview.findMany.mockResolvedValueOnce([first, second]);
    prismaMock.preview.update.mockImplementation(async ({ where, data }) => {
      const existing = rows.get(where.id) ?? makePreview({ id: where.id });
      const updated = makePreview({ ...existing, ...data });
      rows.set(where.id, updated);
      return updated;
    });

    const result = await makeService().stopActiveForSessionGroup({
      sessionGroupId: "group-1",
      organizationId: "org-1",
      actorType: "system",
      actorId: "system",
    });

    expect(result).toHaveLength(2);
    expect(gatewayMock.revokeRoute).toHaveBeenCalledTimes(2);
    expect(terminalRelayMock.destroyTerminal).toHaveBeenCalledTimes(2);
  });
});
