import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "./db.js";
import { createSessionTicketsLoader, createUserLoader } from "./dataloader.js";

const prismaMock = prisma as any;

describe("createUserLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads users in input order and fills gaps with null", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u2", name: "Bob", avatarUrl: null },
      { id: "u1", name: "Alice", avatarUrl: "a.png" },
    ]);

    const loader = createUserLoader();

    await expect(loader.loadMany(["u1", "u3", "u2"])).resolves.toEqual([
      { id: "u1", name: "Alice", avatarUrl: "a.png" },
      null,
      { id: "u2", name: "Bob", avatarUrl: null },
    ]);
  });
});

describe("createSessionTicketsLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("limits linked session tickets to the active organization", async () => {
    prismaMock.ticketLink.findMany.mockResolvedValueOnce([
      { entityId: "session-1", ticketId: "ticket-1" },
      { entityId: "session-2", ticketId: "ticket-2" },
    ]);
    prismaMock.ticket.findMany.mockResolvedValueOnce([
      { id: "ticket-1", organizationId: "org-1", links: [], assignees: [] },
    ]);

    const loader = createSessionTicketsLoader("org-1");

    await expect(loader.loadMany(["session-1", "session-2"])).resolves.toEqual([
      [{ id: "ticket-1", organizationId: "org-1", links: [], assignees: [] }],
      [],
    ]);
    expect(prismaMock.ticketLink.findMany).toHaveBeenCalledWith({
      where: {
        entityType: "session",
        entityId: { in: ["session-1", "session-2"] },
        ticket: { organizationId: "org-1" },
      },
      select: { entityId: true, ticketId: true },
    });
    expect(prismaMock.ticket.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["ticket-1", "ticket-2"] }, organizationId: "org-1" },
      include: {
        assignees: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        links: true,
      },
    });
  });
});
