import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { integrationRequestAuditStore } from "./integration-request-audit.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;

describe("IntegrationRequestAuditStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends immutable start and completion entries without sensitive payloads", async () => {
    const startedAt = new Date("2026-08-09T12:00:00.000Z");
    const audit = {
      id: "request-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      bindingId: "binding-1",
      connectionId: "connection-1",
      userId: "user-1",
      executionIdentity: "viewer" as const,
      method: "GET",
      path: "/user",
      startedAt,
    };

    await integrationRequestAuditStore.start(audit);
    await integrationRequestAuditStore.complete({
      ...audit,
      phase: "completed",
      status: 200,
      timestamp: new Date("2026-08-09T12:00:00.025Z"),
      durationMs: 25,
    });

    expect(prismaMock.integrationRequestAuditEntry.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.integrationRequestAuditEntry.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ requestId: "request-1", phase: "started" }),
      }),
    );
    expect(prismaMock.integrationRequestAuditEntry.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: "request-1",
          phase: "completed",
          responseStatus: 200,
          durationMs: 25,
        }),
      }),
    );
    for (const [call] of prismaMock.integrationRequestAuditEntry.create.mock.calls) {
      expect(call.data).not.toHaveProperty("body");
      expect(call.data).not.toHaveProperty("query");
      expect(call.data).not.toHaveProperty("providerConfigKey");
    }
  });
});
