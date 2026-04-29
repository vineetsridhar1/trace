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
import { ticketTypeResolvers } from "../schema/ticket.js";
import { TicketService } from "./ticket.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;

describe("TicketService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
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
        acceptanceCriteria: [],
        testPlan: undefined,
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
          acceptanceCriteria: undefined,
          testPlan: undefined,
          dependencyTicketIds: [],
        },
        actorType: "user",
        actorId: "user-1",
      },
      prismaMock,
    );
  });

  it("persists acceptance criteria, test plans, and dependency edges on create", async () => {
    prismaMock.ticket.count.mockResolvedValueOnce(2);
    prismaMock.ticket.create.mockResolvedValueOnce({
      id: "ticket-1",
      title: "Fix auth",
      priority: "high",
      organizationId: "org-1",
      acceptanceCriteria: ["Shows an error"],
      testPlan: "Run auth tests",
    });

    const service = new TicketService();
    await service.create({
      organizationId: "org-1",
      title: "Fix auth",
      priority: "high",
      acceptanceCriteria: ["Shows an error"],
      testPlan: "Run auth tests",
      dependencyTicketIds: ["ticket-a", "ticket-b", "ticket-a"],
      actorType: "user",
      actorId: "user-1",
    } as any);

    expect(prismaMock.ticket.count).toHaveBeenCalledWith({
      where: {
        id: { in: ["ticket-a", "ticket-b"] },
        organizationId: "org-1",
      },
    });
    expect(prismaMock.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acceptanceCriteria: ["Shows an error"],
        testPlan: "Run auth tests",
        dependencies: {
          create: [
            { dependsOnTicketId: "ticket-a", organizationId: "org-1" },
            { dependsOnTicketId: "ticket-b", organizationId: "org-1" },
          ],
        },
      }),
      include: expect.any(Object),
    });
  });

  it("updates tickets and records prior status in the event payload", async () => {
    prismaMock.ticket.findUniqueOrThrow.mockResolvedValueOnce({
      organizationId: "org-1",
      status: "todo",
    });
    prismaMock.ticket.count.mockResolvedValueOnce(1);
    prismaMock.ticket.update.mockResolvedValueOnce({ id: "ticket-1", title: "Updated" });

    const service = new TicketService();
    await service.update(
      "ticket-1",
      {
        title: "Updated",
        status: "done",
        description: null,
        acceptanceCriteria: ["Works"],
        testPlan: "Run tests",
        dependencyTicketIds: ["ticket-0"],
      } as any,
      "user",
      "user-1",
    );

    expect(prismaMock.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: {
        title: "Updated",
        status: "done",
        acceptanceCriteria: ["Works"],
        testPlan: "Run tests",
        dependencies: {
          deleteMany: {},
          create: [{ dependsOnTicketId: "ticket-0", organizationId: "org-1" }],
        },
      },
      include: expect.any(Object),
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        scopeType: "ticket",
        scopeId: "ticket-1",
        eventType: "ticket_updated",
        payload: {
          ticketId: "ticket-1",
          changes: {
            title: "Updated",
            status: "done",
            description: null,
            acceptanceCriteria: ["Works"],
            testPlan: "Run tests",
            dependencyTicketIds: ["ticket-0"],
          },
          previousStatus: "todo",
        },
        actorType: "user",
        actorId: "user-1",
      },
      prismaMock,
    );
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

  it("resolves ticket dependency fields with org scoping", async () => {
    prismaMock.ticketDependency.findMany.mockResolvedValueOnce([
      {
        ticketId: "ticket-1",
        dependsOnTicketId: "ticket-0",
        organizationId: "org-1",
        reason: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const dependencies = await ticketTypeResolvers.Ticket.dependencies(
      { id: "ticket-1", organizationId: "org-1" },
      {},
      { organizationId: "org-1" } as any,
    );

    expect(dependencies).toHaveLength(1);
    expect(prismaMock.ticketDependency.findMany).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1", organizationId: "org-1" },
      include: { ticket: true, dependsOnTicket: true },
      orderBy: { createdAt: "asc" },
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
