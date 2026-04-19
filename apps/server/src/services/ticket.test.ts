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
import { TicketService } from "./ticket.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;

describe("TicketService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
  });

  it("creates tickets with defaults, relationships, and events", async () => {
    prismaMock.project.findFirstOrThrow.mockResolvedValueOnce({ id: "project-1" });
    prismaMock.orgMember.findMany.mockResolvedValueOnce([{ userId: "user-2" }]);
    prismaMock.ticket.create.mockResolvedValueOnce({
      id: "ticket-1",
      title: "Fix auth",
      priority: "medium",
      organizationId: "org-1",
    });

    const service = new TicketService();
    const ticket = await service.create({
      organizationId: "org-1",
      title: "Fix auth",
      projectId: "project-1",
      assigneeIds: ["user-2"],
      actorType: "user",
      actorId: "user-1",
    } as any);

    expect(ticket.id).toBe("ticket-1");
    expect(prismaMock.ticket.create).toHaveBeenCalledWith({
      data: {
        title: "Fix auth",
        description: "",
        priority: "medium",
        labels: [],
        organizationId: "org-1",
        createdById: "user-1",
        channelId: undefined,
        projects: { create: { projectId: "project-1" } },
        assignees: {
          create: [{ userId: "user-2" }],
        },
      },
      include: expect.any(Object),
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "ticket",
      scopeId: "ticket-1",
      eventType: "ticket_created",
      payload: {
        ticketId: "ticket-1",
        title: "Fix auth",
        priority: "medium",
      },
      actorType: "user",
      actorId: "user-1",
    }, prismaMock);
  });

  it("updates tickets and records prior status in the event payload", async () => {
    prismaMock.ticket.findFirstOrThrow.mockResolvedValueOnce({
      organizationId: "org-1",
      status: "todo",
    });
    prismaMock.ticket.update.mockResolvedValueOnce({ id: "ticket-1", title: "Updated" });

    const service = new TicketService();
    await service.update(
      "ticket-1",
      { title: "Updated", status: "done", description: null } as any,
      "user",
      "user-1",
      "org-1",
    );

    expect(prismaMock.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: {
        title: "Updated",
        status: "done",
      },
      include: expect.any(Object),
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "ticket",
      scopeId: "ticket-1",
      eventType: "ticket_updated",
      payload: {
        ticketId: "ticket-1",
        changes: { title: "Updated", status: "done", description: null },
        previousStatus: "todo",
      },
      actorType: "user",
      actorId: "user-1",
    });
  });

  it("adds comments through event creation", async () => {
    prismaMock.ticket.findFirstOrThrow.mockResolvedValueOnce({ organizationId: "org-1" });
    eventServiceMock.create.mockResolvedValueOnce({ id: "event-1" });

    const service = new TicketService();
    await expect(
      service.addComment("ticket-1", "hello", "user", "user-1", "org-1"),
    ).resolves.toEqual({
      id: "event-1",
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "ticket",
      scopeId: "ticket-1",
      eventType: "ticket_commented",
      payload: { text: "hello" },
      actorType: "user",
      actorId: "user-1",
    });
  });

  it("assigns, links, and unlinks tickets inside transactions", async () => {
    // Each transactional action now calls findFirstOrThrow first (org check)
    // and then findUniqueOrThrow to hydrate the full entity for the event.
    prismaMock.ticket.findFirstOrThrow
      .mockResolvedValueOnce({ id: "ticket-1" })
      .mockResolvedValueOnce({ id: "ticket-1" })
      .mockResolvedValueOnce({ id: "ticket-1" });
    prismaMock.orgMember.findUniqueOrThrow
      .mockResolvedValueOnce({ userId: "user-1" })
      .mockResolvedValueOnce({ userId: "user-2" })
      .mockResolvedValueOnce({ userId: "user-1" })
      .mockResolvedValueOnce({ userId: "user-1" });
    prismaMock.ticket.findUniqueOrThrow
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" });
    prismaMock.session.findFirstOrThrow.mockResolvedValueOnce({ id: "session-1" });

    const service = new TicketService();
    await service.assign({
      ticketId: "ticket-1",
      userId: "user-2",
      actorType: "user",
      actorId: "user-1",
      organizationId: "org-1",
    });
    await service.link({
      ticketId: "ticket-1",
      entityType: "session",
      entityId: "session-1",
      actorType: "user",
      actorId: "user-1",
      organizationId: "org-1",
    });
    await service.unlink({
      ticketId: "ticket-1",
      entityType: "session",
      entityId: "session-1",
      actorType: "user",
      actorId: "user-1",
      organizationId: "org-1",
    });

    expect(prismaMock.ticketAssignee.create).toHaveBeenCalledWith({
      data: { ticketId: "ticket-1", userId: "user-2" },
    });
    expect(prismaMock.ticketLink.create).toHaveBeenCalledWith({
      data: { ticketId: "ticket-1", entityType: "session", entityId: "session-1" },
    });
    expect(prismaMock.ticketLink.delete).toHaveBeenCalledWith({
      where: {
        ticketId_entityType_entityId: {
          ticketId: "ticket-1",
          entityType: "session",
          entityId: "session-1",
        },
      },
    });
  });

  it("rejects linking a ticket to a session in another org", async () => {
    prismaMock.ticket.findFirstOrThrow.mockResolvedValueOnce({ id: "ticket-1" });
    prismaMock.session.findFirstOrThrow.mockRejectedValueOnce(new Error("No record found"));

    const service = new TicketService();

    await expect(
      service.link({
        ticketId: "ticket-1",
        entityType: "session",
        entityId: "session-org-b",
        actorType: "user",
        actorId: "user-1",
        organizationId: "org-1",
      }),
    ).rejects.toThrow();

    expect(prismaMock.ticketLink.create).not.toHaveBeenCalled();
  });
});
