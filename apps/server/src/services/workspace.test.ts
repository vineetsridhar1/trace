import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { workspaceService } from "./workspace.js";

describe("WorkspaceService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes and targets a browser-open request to the requesting user", async () => {
    vi.mocked(prisma.sessionGroup.findFirst).mockResolvedValueOnce({
      id: "group-1",
      visibility: "public",
      ownerUserId: "owner-1",
    } as never);

    await expect(
      workspaceService.openBrowser({
        sessionGroupId: "group-1",
        url: "example.com/docs",
        organizationId: "org-1",
        userId: "user-1",
        actorType: "agent",
      }),
    ).resolves.toBe(true);

    expect(eventService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "workspace_browser_open_requested",
        payload: {
          sessionGroupId: "group-1",
          targetUserId: "user-1",
          url: "https://example.com/docs",
        },
      }),
    );
  });

  it("rejects non-web URL schemes", async () => {
    vi.mocked(prisma.sessionGroup.findFirst).mockResolvedValueOnce({
      id: "group-1",
      visibility: "public",
      ownerUserId: "owner-1",
    } as never);

    await expect(
      workspaceService.openBrowser({
        sessionGroupId: "group-1",
        url: "file:///etc/passwd",
        organizationId: "org-1",
        userId: "user-1",
        actorType: "agent",
      }),
    ).rejects.toThrow("Browser URL must use HTTP or HTTPS");
    expect(eventService.create).not.toHaveBeenCalled();
  });
});
