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
    prismaMock.orgMember.count.mockResolvedValue(1);
  });

  it("creates tickets with defaults, relationships, and events", async () => {
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
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
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
      },
      prismaMock,
    );
  });

  it("validates ticket channel, project, and assignees against the ticket organization", async () => {
    prismaMock.orgMember.count.mockResolvedValueOnce(1);
    prismaMock.ticket.create.mockResolvedValueOnce({
      id: "ticket-1",
      title: "Fix auth",
      priority: "medium",
      organizationId: "org-1",
    });

    const service = new TicketService();
    await service.create({
      organizationId: "org-1",
      title: "Fix auth",
      channelId: "channel-1",
      projectId: "project-1",
      assigneeIds: ["user-2", "user-2"],
      actorType: "user",
      actorId: "user-1",
    } as any);

    expect(prismaMock.channel.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "channel-1", organizationId: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.project.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "project-1", organizationId: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.orgMember.count).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: { in: ["user-2"] } },
    });
  });

  it("rejects ticket creation when assignees are outside the organization", async () => {
    prismaMock.orgMember.count.mockResolvedValueOnce(0);

    const service = new TicketService();
    await expect(
      service.create({
        organizationId: "org-1",
        title: "Fix auth",
        assigneeIds: ["user-2"],
        actorType: "user",
        actorId: "user-1",
      } as any),
    ).rejects.toThrow("Assignees must belong to the ticket organization");

    expect(prismaMock.ticket.create).not.toHaveBeenCalled();
  });

  it("updates tickets and records prior status in the event payload", async () => {
    prismaMock.ticket.findUniqueOrThrow.mockResolvedValueOnce({
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
    prismaMock.ticket.findUniqueOrThrow.mockResolvedValueOnce({ organizationId: "org-1" });
    eventServiceMock.create.mockResolvedValueOnce({ id: "event-1" });

    const service = new TicketService();
    await expect(service.addComment("ticket-1", "hello", "user", "user-1")).resolves.toEqual({
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
    prismaMock.ticket.findUniqueOrThrow
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "ticket-1", organizationId: "org-1" });

    const service = new TicketService();
    await service.assign({
      ticketId: "ticket-1",
      userId: "user-2",
      actorType: "user",
      actorId: "user-1",
    });
    await service.link({
      ticketId: "ticket-1",
      entityType: "session",
      entityId: "session-1",
      actorType: "user",
      actorId: "user-1",
    } as any);
    await service.unlink({
      ticketId: "ticket-1",
      entityType: "session",
      entityId: "session-1",
      actorType: "user",
      actorId: "user-1",
    } as any);

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

  it("validates ticket assignment targets against the ticket organization", async () => {
    prismaMock.ticket.findUniqueOrThrow.mockResolvedValueOnce({
      id: "ticket-1",
      organizationId: "org-1",
    });
    prismaMock.orgMember.findUniqueOrThrow
      .mockResolvedValueOnce({ userId: "user-1" })
      .mockRejectedValueOnce(new Error("Not found"));

    const service = new TicketService();
    await expect(
      service.assign({
        ticketId: "ticket-1",
        userId: "user-cross-org",
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("Not found");

    expect(prismaMock.orgMember.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: "user-cross-org", organizationId: "org-1" } },
      select: { userId: true },
    });
    expect(prismaMock.ticketAssignee.create).not.toHaveBeenCalled();
  });

  it("validates linked sessions against the ticket organization", async () => {
    prismaMock.ticket.findUniqueOrThrow.mockResolvedValueOnce({
      id: "ticket-1",
      organizationId: "org-1",
    });
    prismaMock.session.findFirstOrThrow.mockRejectedValueOnce(new Error("Not found"));

    const service = new TicketService();
    await expect(
      service.link({
        ticketId: "ticket-1",
        entityType: "session",
        entityId: "session-cross-org",
        actorType: "user",
        actorId: "user-1",
      } as any),
    ).rejects.toThrow("Not found");

    expect(prismaMock.session.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "session-cross-org", organizationId: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.ticketLink.create).not.toHaveBeenCalled();
  });

  it("validates linked chats against actor membership and organization membership", async () => {
    prismaMock.ticket.findUniqueOrThrow.mockResolvedValueOnce({
      id: "ticket-1",
      organizationId: "org-1",
    });
    prismaMock.chat.findFirstOrThrow.mockRejectedValueOnce(new Error("Not found"));

    const service = new TicketService();
    await expect(
      service.link({
        ticketId: "ticket-1",
        entityType: "chat",
        entityId: "chat-private",
        actorType: "user",
        actorId: "user-1",
      } as any),
    ).rejects.toThrow("Not found");

    expect(prismaMock.chat.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "chat-private",
        organizationId: "org-1",
        members: { some: { userId: "user-1", leftAt: null } },
      },
      select: { id: true },
    });
    expect(prismaMock.ticketLink.create).not.toHaveBeenCalled();
  });

  it("rejects cross-org ticket writes when the actor is not a member", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockRejectedValueOnce(new Error("Not found"));

    const service = new TicketService();
    await expect(
      service.create({
        organizationId: "org-2",
        title: "Fix auth",
        actorType: "user",
        actorId: "user-1",
      } as any),
    ).rejects.toThrow("Not found");

    expect(prismaMock.ticket.create).not.toHaveBeenCalled();
  });
});
