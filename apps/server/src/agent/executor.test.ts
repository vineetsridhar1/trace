import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceContainer } from "./executor.js";
import { ActionExecutor, InMemoryIdempotencyStore } from "./executor.js";

function createServices(): ServiceContainer {
  return {
    ticketService: {
      create: vi.fn().mockResolvedValue({ id: "ticket-1" }),
      update: vi.fn().mockResolvedValue({ id: "ticket-1", status: "done" }),
      addComment: vi.fn().mockResolvedValue({ id: "event-1" }),
      link: vi.fn().mockResolvedValue({ id: "ticket-1", entityId: "session-1" }),
    } as unknown as ServiceContainer["ticketService"],
    chatService: {
      sendMessage: vi.fn().mockResolvedValue({ id: "message-1" }),
    } as unknown as ServiceContainer["chatService"],
    sessionService: {
      start: vi.fn().mockResolvedValue({ id: "session-1" }),
      pause: vi.fn().mockResolvedValue({ id: "session-1", agentStatus: "done" }),
      resume: vi.fn().mockResolvedValue({ id: "session-1", agentStatus: "active" }),
    } as unknown as ServiceContainer["sessionService"],
    inboxService: {
      createItem: vi.fn().mockResolvedValue({ id: "inbox-1" }),
    } as unknown as ServiceContainer["inboxService"],
  };
}

const ctx = {
  organizationId: "org-1",
  agentId: "agent-1",
  triggerEventId: "evt-1",
};

describe("ActionExecutor", () => {
  let services: ServiceContainer;

  beforeEach(() => {
    services = createServices();
  });

  it("returns success immediately for no_op actions", async () => {
    const executor = new ActionExecutor(services);

    await expect(executor.execute({ actionType: "no_op", args: {} }, ctx)).resolves.toEqual({
      status: "success",
      actionType: "no_op",
    });
  });

  it("rejects unknown actions", async () => {
    const executor = new ActionExecutor(services);

    await expect(
      executor.execute({ actionType: "unknown.action", args: {} }, ctx),
    ).resolves.toEqual({
      status: "failed",
      actionType: "unknown.action",
      error: "Unknown action: unknown.action",
    });
  });

  it("rejects invalid parameters before dispatching", async () => {
    const executor = new ActionExecutor(services);

    const result = await executor.execute({ actionType: "ticket.create", args: {} }, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Missing required field: title");
    expect(services.ticketService.create as any).not.toHaveBeenCalled();
  });

  it("injects agent context into ticket creation", async () => {
    const executor = new ActionExecutor(services);

    const result = await executor.execute(
      {
        actionType: "ticket.create",
        args: { title: "Bug: login broken", priority: "high" },
      },
      ctx,
    );

    expect(result).toEqual({
      status: "success",
      actionType: "ticket.create",
      result: { id: "ticket-1" },
    });
    expect(services.ticketService.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      title: "Bug: login broken",
      description: undefined,
      priority: "high",
      labels: undefined,
      channelId: undefined,
      projectId: undefined,
      assigneeIds: undefined,
      actorType: "agent",
      actorId: "agent-1",
    });
  });

  it("dispatches update, comment, link, chat, and session methods", async () => {
    const executor = new ActionExecutor(services);

    await executor.execute(
      { actionType: "ticket.update", args: { id: "ticket-1", status: "in_progress" } },
      { ...ctx, triggerEventId: "evt-update" },
    );
    await executor.execute(
      { actionType: "ticket.addComment", args: { ticketId: "ticket-1", text: "done" } },
      { ...ctx, triggerEventId: "evt-comment" },
    );
    await executor.execute(
      {
        actionType: "link.create",
        args: { ticketId: "ticket-1", entityType: "session", entityId: "session-1" },
      },
      { ...ctx, triggerEventId: "evt-link" },
    );
    await executor.execute(
      { actionType: "message.send", args: { chatId: "chat-1", text: "hello" } },
      { ...ctx, triggerEventId: "evt-message" },
    );
    await executor.execute(
      { actionType: "session.pause", args: { id: "session-1" } },
      { ...ctx, triggerEventId: "evt-pause" },
    );
    await executor.execute(
      { actionType: "session.resume", args: { id: "session-1" } },
      { ...ctx, triggerEventId: "evt-resume" },
    );

    expect(services.ticketService.update).toHaveBeenCalledWith(
      "ticket-1",
      { status: "in_progress" },
      "agent",
      "agent-1",
    );
    expect(services.ticketService.addComment).toHaveBeenCalledWith(
      "ticket-1",
      "done",
      "agent",
      "agent-1",
    );
    expect(services.ticketService.link).toHaveBeenCalledWith({
      ticketId: "ticket-1",
      entityType: "session",
      entityId: "session-1",
      actorType: "agent",
      actorId: "agent-1",
    });
    expect(services.chatService.sendMessage).toHaveBeenCalledWith({
      chatId: "chat-1",
      organizationId: "org-1",
      text: "hello",
      html: undefined,
      parentId: undefined,
      actorType: "agent",
      actorId: "agent-1",
    });
    expect(services.sessionService.pause).toHaveBeenCalledWith("session-1", "agent", "agent-1");
    expect(services.sessionService.resume).toHaveBeenCalledWith("session-1", "agent", "agent-1");
  });

  it("uses idempotency keys per agent, action, and trigger event", async () => {
    const executor = new ActionExecutor(services);

    const first = await executor.execute(
      { actionType: "ticket.create", args: { title: "Same" } },
      { ...ctx, triggerEventId: "evt-same" },
    );
    const second = await executor.execute(
      { actionType: "ticket.create", args: { title: "Same" } },
      { ...ctx, triggerEventId: "evt-same" },
    );

    expect(first.status).toBe("success");
    expect(second).toEqual({
      status: "success",
      actionType: "ticket.create",
      result: "duplicate — already executed for this trigger event",
    });
    expect(services.ticketService.create).toHaveBeenCalledTimes(1);
  });

  it("supports an injected idempotency store", async () => {
    const store = new InMemoryIdempotencyStore();
    const executor = new ActionExecutor(services, store);

    await expect(store.has("agent:agent-1:ticket.create:evt-store")).resolves.toBe(false);
    await executor.execute(
      { actionType: "ticket.create", args: { title: "Stored" } },
      { ...ctx, triggerEventId: "evt-store" },
    );
    await expect(store.has("agent:agent-1:ticket.create:evt-store")).resolves.toBe(true);
  });

  it("returns service errors instead of throwing", async () => {
    (services.ticketService.create as any).mockRejectedValueOnce(new Error("DB lost"));
    const executor = new ActionExecutor(services);

    await expect(
      executor.execute(
        { actionType: "ticket.create", args: { title: "Boom" } },
        { ...ctx, triggerEventId: "evt-error" },
      ),
    ).resolves.toEqual({
      status: "failed",
      actionType: "ticket.create",
      error: "DB lost",
    });
  });
});
