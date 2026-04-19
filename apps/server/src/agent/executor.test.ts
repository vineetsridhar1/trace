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
    } as unknown as ServiceContainer["sessionService"],
    channelService: {
      sendMessage: vi.fn().mockResolvedValue({ id: "channel-msg-1" }),
    } as unknown as ServiceContainer["channelService"],
    inboxService: {
      createItem: vi.fn().mockResolvedValue({ id: "inbox-1" }),
    } as unknown as ServiceContainer["inboxService"],
    organizationService: {
      searchUsers: vi.fn().mockResolvedValue([]),
      createProject: vi.fn().mockResolvedValue({ id: "project-1" }),
      linkEntityToProject: vi.fn().mockResolvedValue({ id: "project-1" }),
      getProject: vi.fn().mockResolvedValue(null),
      getUserProfile: vi.fn().mockResolvedValue({ id: "user-1" }),
      listProjects: vi.fn().mockResolvedValue([]),
      listRepos: vi.fn().mockResolvedValue([]),
    } as unknown as ServiceContainer["organizationService"],
    eventService: {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as ServiceContainer["eventService"],
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
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    await expect(executor.execute({ actionType: "no_op", args: {} }, ctx)).resolves.toEqual({
      status: "success",
      actionType: "no_op",
    });
  });

  it("rejects unknown actions", async () => {
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    await expect(
      executor.execute({ actionType: "unknown.action", args: {} }, ctx),
    ).resolves.toEqual({
      status: "failed",
      actionType: "unknown.action",
      error: "Unknown action: unknown.action",
    });
  });

  it("rejects invalid parameters before dispatching", async () => {
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    const result = await executor.execute({ actionType: "ticket.create", args: {} }, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Missing required field: title");
    expect(services.ticketService.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("injects agent context into ticket creation", async () => {
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

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
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

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
    expect(services.ticketService.update).toHaveBeenCalledWith(
      "ticket-1",
      { status: "in_progress" },
      "agent",
      "agent-1",
      "org-1",
    );
    expect(services.ticketService.addComment).toHaveBeenCalledWith(
      "ticket-1",
      "done",
      "agent",
      "agent-1",
      "org-1",
    );
    expect(services.ticketService.link).toHaveBeenCalledWith({
      ticketId: "ticket-1",
      entityType: "session",
      entityId: "session-1",
      actorType: "agent",
      actorId: "agent-1",
      organizationId: "org-1",
    });
    expect(services.chatService.sendMessage).toHaveBeenCalledWith({
      chatId: "chat-1",
      text: "hello",
      html: undefined,
      parentId: undefined,
      actorType: "agent",
      actorId: "agent-1",
    });
  });

  it("uses idempotency keys per agent, action, and trigger event", async () => {
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

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

    await executor.execute(
      { actionType: "ticket.create", args: { title: "Stored" } },
      { ...ctx, triggerEventId: "evt-store" },
    );

    // Verify idempotency: a duplicate call should return the dedup result
    const duplicate = await executor.execute(
      { actionType: "ticket.create", args: { title: "Stored" } },
      { ...ctx, triggerEventId: "evt-store" },
    );
    expect(duplicate.result).toBe("duplicate — already executed for this trigger event");
    expect(services.ticketService.create).toHaveBeenCalledTimes(1);
  });

  it("returns service errors instead of throwing", async () => {
    (services.ticketService.create as any).mockRejectedValueOnce(new Error("DB lost"));
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

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

  it("dispatches ticket.query via searchByRelevance", async () => {
    (services.ticketService as any).searchByRelevance = vi.fn().mockResolvedValue([
      { id: "ticket-1", title: "Login bug" },
    ]);
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    const result = await executor.execute(
      { actionType: "ticket.query", args: { query: "login bug", limit: 3 } },
      { ...ctx, triggerEventId: "evt-query" },
    );

    expect(result.status).toBe("success");
    expect((services.ticketService as any).searchByRelevance).toHaveBeenCalledWith({
      organizationId: "org-1",
      query: "login bug",
      limit: 3,
    });
  });

  it("dispatches ticket.get via getById", async () => {
    (services.ticketService as any).getById = vi.fn().mockResolvedValue({
      id: "ticket-42", title: "Login bug", status: "in_progress",
    });
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    const result = await executor.execute(
      { actionType: "ticket.get", args: { ticketId: "ticket-42" } },
      { ...ctx, triggerEventId: "evt-get" },
    );

    expect(result.status).toBe("success");
    expect(result.result).toEqual({ id: "ticket-42", title: "Login bug", status: "in_progress" });
    expect((services.ticketService as any).getById).toHaveBeenCalledWith("org-1", "ticket-42");
  });

  it("caps ticket.query limit at 10", async () => {
    (services.ticketService as any).searchByRelevance = vi.fn().mockResolvedValue([]);
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    await executor.execute(
      { actionType: "ticket.query", args: { query: "test", limit: 50 } },
      { ...ctx, triggerEventId: "evt-query-cap" },
    );

    expect((services.ticketService as any).searchByRelevance).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it("dispatches suggestion.query via listAgentSuggestions", async () => {
    (services.inboxService as any).listAgentSuggestions = vi.fn().mockResolvedValue([
      { id: "inbox-1", title: "Create ticket", status: "active" },
    ]);
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    const result = await executor.execute(
      { actionType: "suggestion.query", args: { status: "active" } },
      { ...ctx, triggerEventId: "evt-suggest-query" },
    );

    expect(result.status).toBe("success");
    expect((services.inboxService as any).listAgentSuggestions).toHaveBeenCalledWith(
      "org-1",
      { status: "active", limit: 10 },
    );
  });

  it("dispatches message.sendToChannel", async () => {
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    const result = await executor.execute(
      { actionType: "message.sendToChannel", args: { channelId: "chan-1", text: "hello", threadId: "msg-1" } },
      { ...ctx, triggerEventId: "evt-channel" },
    );

    expect(result.status).toBe("success");
    expect(services.channelService.sendMessage).toHaveBeenCalledWith(
      "chan-1",
      "hello",
      "msg-1",
      "agent",
      "agent-1",
    );
  });

  it("dispatches channel.sendMessage", async () => {
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    const result = await executor.execute(
      { actionType: "channel.sendMessage", args: { channelId: "chan-1", text: "hello", threadId: "msg-1" } },
      { ...ctx, triggerEventId: "evt-channel-new" },
    );

    expect(result.status).toBe("success");
    expect(services.channelService.sendMessage).toHaveBeenCalledWith(
      "chan-1",
      "hello",
      "msg-1",
      "agent",
      "agent-1",
    );
  });

  it("deduplicates channel.sendMessage and message.sendToChannel aliases", async () => {
    const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());

    const first = await executor.execute(
      { actionType: "channel.sendMessage", args: { channelId: "chan-1", text: "hello", threadId: "msg-1" } },
      { ...ctx, triggerEventId: "evt-channel-alias" },
    );
    const second = await executor.execute(
      { actionType: "message.sendToChannel", args: { channelId: "chan-1", text: "hello", threadId: "msg-1" } },
      { ...ctx, triggerEventId: "evt-channel-alias" },
    );

    expect(first.status).toBe("success");
    expect(second).toEqual({
      status: "success",
      actionType: "message.sendToChannel",
      result: "duplicate — already executed for this trigger event",
    });
    expect(services.channelService.sendMessage).toHaveBeenCalledTimes(1);
  });
});
