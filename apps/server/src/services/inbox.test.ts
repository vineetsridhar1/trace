import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { InboxService } from "./inbox.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;

describe("InboxService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates inbox items and emits discovery events", async () => {
    prismaMock.inboxItem.create.mockResolvedValueOnce({ id: "item-1" });

    const service = new InboxService();
    await expect(
      service.createItem({
        orgId: "org-1",
        userId: "user-1",
        itemType: "question",
        title: "Need review",
        sourceType: "session",
        sourceId: "session-1",
      }),
    ).resolves.toEqual({ id: "item-1" });

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        scopeType: "system",
        scopeId: "org-1",
        eventType: "inbox_item_created",
        payload: { inboxItem: { id: "item-1" } },
        actorType: "system",
        actorId: "system",
      },
      prismaMock,
    );
  });

  it("resolves active items by source and preserves payload fields", async () => {
    prismaMock.inboxItem.findMany.mockResolvedValueOnce([
      { id: "item-1", payload: { existing: true } },
      { id: "item-2", payload: null },
    ]);
    prismaMock.inboxItem.update
      .mockResolvedValueOnce({ id: "item-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "item-2", organizationId: "org-1" });

    const service = new InboxService();
    await service.resolveBySource({
      sourceType: "session",
      sourceId: "session-1",
      orgId: "org-1",
      resolution: "approved",
    });

    expect(prismaMock.inboxItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: "item-1" },
      data: {
        status: "resolved",
        resolvedAt: expect.any(Date),
        payload: { existing: true, resolution: "approved" },
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledTimes(2);
  });

  it("dismisses owned inbox items", async () => {
    prismaMock.inboxItem.findFirstOrThrow.mockResolvedValueOnce({
      id: "item-1",
      payload: { existing: true },
    });
    prismaMock.inboxItem.update.mockResolvedValueOnce({
      id: "item-1",
      organizationId: "org-1",
    });

    const service = new InboxService();
    await expect(service.dismiss("item-1", "user-1", "org-1")).resolves.toEqual({
      id: "item-1",
      organizationId: "org-1",
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "org-1",
      eventType: "inbox_item_resolved",
      payload: { inboxItem: { id: "item-1", organizationId: "org-1" } },
      actorType: "user",
      actorId: "user-1",
    });
  });

  it("expires only suggestions returned by the expiry query and emits resolution events", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "item-1",
        organizationId: "org-1",
        payload: { expiresAt: "2026-03-25T00:00:00.000Z", existing: true },
      },
    ]);
    prismaMock.inboxItem.update.mockResolvedValueOnce({
      id: "item-1",
      organizationId: "org-1",
      itemType: "ticket_suggestion",
      payload: { expiresAt: "2026-03-25T00:00:00.000Z", existing: true, resolution: "expired" },
    });

    const service = new InboxService();
    const result = await service.expireSuggestions();

    expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
    expect(prismaMock.inboxItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        status: "expired",
        resolvedAt: expect.any(Date),
        payload: {
          expiresAt: "2026-03-25T00:00:00.000Z",
          existing: true,
          resolution: "expired",
        },
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "org-1",
      eventType: "inbox_item_resolved",
      payload: {
        inboxItem: {
          id: "item-1",
          organizationId: "org-1",
          itemType: "ticket_suggestion",
          payload: {
            expiresAt: "2026-03-25T00:00:00.000Z",
            existing: true,
            resolution: "expired",
          },
        },
        resolution: "expired",
      },
      actorType: "system",
      actorId: "system",
    });
    expect(result).toEqual([
      {
        id: "item-1",
        organizationId: "org-1",
        itemType: "ticket_suggestion",
        payload: {
          expiresAt: "2026-03-25T00:00:00.000Z",
          existing: true,
          resolution: "expired",
        },
      },
    ]);
  });
});
