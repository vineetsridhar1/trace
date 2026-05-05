import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@prisma/client";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
}));

import { prisma } from "../lib/db.js";
import { asMock } from "../../test/helpers.js";
import { inboxService } from "./inbox.js";

const baseItem = {
  id: "inbox-1",
  itemType: "question",
  status: "active",
  title: "Question",
  summary: null,
  payload: {},
  userId: "user-1",
  organizationId: "org-1",
  sourceType: "session",
  sourceId: "session-active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  resolvedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} satisfies InboxItem;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InboxService", () => {
  it("lists only the user's inbox items whose session source is not archived", async () => {
    const archivedItem = { ...baseItem, id: "inbox-2", sourceId: "session-archived" };
    asMock(prisma.inboxItem.findMany).mockResolvedValue([baseItem, archivedItem]);
    asMock(prisma.session.findMany).mockResolvedValue([{ id: "session-archived" }]);

    const result = await inboxService.listForUser("org-1", "user-1", "active");

    expect(prisma.inboxItem.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: "user-1", status: "active" },
      orderBy: { createdAt: "desc" },
    });
    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        id: { in: ["session-active", "session-archived"] },
        sessionGroup: { archivedAt: { not: null } },
      },
      select: { id: true },
    });
    expect(result).toEqual([baseItem]);
  });
});
