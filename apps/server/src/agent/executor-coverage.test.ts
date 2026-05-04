import { describe, expect, it, vi } from "vitest";
import { findAction, getAllActions } from "./action-registry.js";
import { ActionExecutor, InMemoryIdempotencyStore } from "./executor.js";
import type { ServiceContainer } from "./executor.js";

type MockFn = ReturnType<typeof vi.fn>;

type MockedServices = ServiceContainer & {
  ticketService: {
    create: MockFn;
    update: MockFn;
    addComment: MockFn;
    assign: MockFn;
    unassign: MockFn;
    link: MockFn;
    unlink: MockFn;
    searchByRelevance: MockFn;
    getById: MockFn;
  };
  chatService: {
    sendMessage: MockFn;
    create: MockFn;
    editMessage: MockFn;
    deleteMessage: MockFn;
    addMember: MockFn;
    leave: MockFn;
    rename: MockFn;
    getChat: MockFn;
    getMessages: MockFn;
    getChats: MockFn;
    getMembers: MockFn;
  };
  channelService: {
    sendMessage: MockFn;
    create: MockFn;
    update: MockFn;
    delete: MockFn;
    join: MockFn;
    leave: MockFn;
    editChannelMessage: MockFn;
    deleteChannelMessage: MockFn;
    getChannel: MockFn;
    listChannels: MockFn;
    getChannelMessages: MockFn;
    getMembers: MockFn;
  };
  sessionService: {
    start: MockFn;
    run: MockFn;
    sendMessage: MockFn;
    terminate: MockFn;
    dismiss: MockFn;
    delete: MockFn;
    get: MockFn;
    list: MockFn;
  };
  inboxService: {
    createItem: MockFn;
    listAgentSuggestions: MockFn;
  };
  organizationService: {
    createProject: MockFn;
    updateProject: MockFn;
    linkEntityToProject: MockFn;
    getProject: MockFn;
    searchUsers: MockFn;
    getUserProfile: MockFn;
    listProjects: MockFn;
    listRepos: MockFn;
  };
  eventService: {
    query: MockFn;
  };
  projectPlanningService: {
    getContext: MockFn;
    askQuestion: MockFn;
    recordAnswer: MockFn;
    recordDecision: MockFn;
    recordRisk: MockFn;
    updatePlanSummary: MockFn;
  };
  summaryService: {
    upsert: MockFn;
  };
  memoryService: {
    search: MockFn;
  };
};

type ExecutionCase = {
  actionType: string;
  args: Record<string, unknown>;
  assertCall: (services: MockedServices) => void;
};

const BASE_CONTEXT = {
  organizationId: "org-1",
  agentId: "agent-1",
};

function result(name: string): { ok: string } {
  return { ok: name };
}

function createServices(): MockedServices {
  return {
    ticketService: {
      create: vi.fn().mockResolvedValue(result("ticket.create")),
      update: vi.fn().mockResolvedValue(result("ticket.update")),
      addComment: vi.fn().mockResolvedValue(result("ticket.addComment")),
      assign: vi.fn().mockResolvedValue(result("ticket.assign")),
      unassign: vi.fn().mockResolvedValue(result("ticket.unassign")),
      link: vi.fn().mockResolvedValue(result("ticket.link")),
      unlink: vi.fn().mockResolvedValue(result("ticket.unlink")),
      searchByRelevance: vi.fn().mockResolvedValue([result("ticket.query")]),
      getById: vi.fn().mockResolvedValue(result("ticket.get")),
    },
    chatService: {
      sendMessage: vi.fn().mockResolvedValue(result("message.send")),
      create: vi.fn().mockResolvedValue(result("chat.create")),
      editMessage: vi.fn().mockResolvedValue(result("chat.editMessage")),
      deleteMessage: vi.fn().mockResolvedValue(result("chat.deleteMessage")),
      addMember: vi.fn().mockResolvedValue(result("chat.addMember")),
      leave: vi.fn().mockResolvedValue(result("chat.leave")),
      rename: vi.fn().mockResolvedValue(result("chat.rename")),
      getChat: vi.fn().mockResolvedValue(result("chat.get")),
      getMessages: vi.fn().mockResolvedValue([result("chat.listMessages")]),
      getChats: vi.fn().mockResolvedValue([result("chat.list")]),
      getMembers: vi.fn().mockResolvedValue([result("chat.getMembers")]),
    },
    channelService: {
      sendMessage: vi.fn().mockResolvedValue(result("channel.sendMessage")),
      create: vi.fn().mockResolvedValue(result("channel.create")),
      update: vi.fn().mockResolvedValue(result("channel.update")),
      delete: vi.fn().mockResolvedValue(result("channel.delete")),
      join: vi.fn().mockResolvedValue(result("channel.join")),
      leave: vi.fn().mockResolvedValue(result("channel.leave")),
      editChannelMessage: vi.fn().mockResolvedValue(result("channel.editMessage")),
      deleteChannelMessage: vi.fn().mockResolvedValue(result("channel.deleteMessage")),
      getChannel: vi.fn().mockResolvedValue(result("channel.get")),
      listChannels: vi.fn().mockResolvedValue([result("channel.list")]),
      getChannelMessages: vi.fn().mockResolvedValue([result("channel.listMessages")]),
      getMembers: vi.fn().mockResolvedValue([result("channel.getMembers")]),
    },
    sessionService: {
      start: vi.fn().mockResolvedValue(result("session.start")),
      run: vi.fn().mockResolvedValue(result("session.run")),
      sendMessage: vi.fn().mockResolvedValue(result("session.sendMessage")),
      terminate: vi.fn().mockResolvedValue(result("session.terminate")),
      dismiss: vi.fn().mockResolvedValue(result("session.dismiss")),
      delete: vi.fn().mockResolvedValue(result("session.delete")),
      get: vi.fn().mockResolvedValue(result("session.get")),
      list: vi.fn().mockResolvedValue([result("session.list")]),
    },
    inboxService: {
      createItem: vi.fn().mockResolvedValue(result("escalate.toHuman")),
      listAgentSuggestions: vi.fn().mockResolvedValue([result("suggestion.query")]),
    },
    organizationService: {
      createProject: vi.fn().mockResolvedValue(result("project.create")),
      updateProject: vi.fn().mockResolvedValue(result("project.update")),
      linkEntityToProject: vi.fn().mockResolvedValue(result("project.linkEntity")),
      getProject: vi.fn().mockResolvedValue(result("project.get")),
      searchUsers: vi.fn().mockResolvedValue([result("users.search")]),
      getUserProfile: vi.fn().mockResolvedValue(result("users.getProfile")),
      listProjects: vi.fn().mockResolvedValue([result("org.listProjects")]),
      listRepos: vi.fn().mockResolvedValue([result("org.listRepos")]),
    },
    eventService: {
      query: vi.fn().mockResolvedValue([result("events.query")]),
    },
    projectPlanningService: {
      getContext: vi.fn().mockResolvedValue({
        project: { id: "project-1" },
        projectRun: { id: "run-1", projectId: "project-1" },
        questions: [],
        answers: [],
        decisions: [],
        risks: [],
      }),
      askQuestion: vi.fn().mockResolvedValue({
        id: "evt-question",
        eventType: "project_question_asked",
      }),
      recordAnswer: vi.fn().mockResolvedValue({
        id: "evt-answer",
        eventType: "project_answer_recorded",
      }),
      recordDecision: vi.fn().mockResolvedValue({
        id: "evt-decision",
        eventType: "project_decision_recorded",
      }),
      recordRisk: vi.fn().mockResolvedValue({
        id: "evt-risk",
        eventType: "project_risk_recorded",
      }),
      updatePlanSummary: vi.fn().mockResolvedValue({
        id: "run-1",
        projectId: "project-1",
        status: "planning",
        planSummary: "Plan v1",
      }),
    },
    summaryService: {
      upsert: vi.fn().mockResolvedValue(result("summary.update")),
    },
    memoryService: {
      search: vi.fn().mockResolvedValue([result("memory.search")]),
    },
  } as unknown as MockedServices;
}

function getAllMocks(services: MockedServices): MockFn[] {
  return [
    services.ticketService.create,
    services.ticketService.update,
    services.ticketService.addComment,
    services.ticketService.assign,
    services.ticketService.unassign,
    services.ticketService.link,
    services.ticketService.unlink,
    services.ticketService.searchByRelevance,
    services.ticketService.getById,
    services.chatService.sendMessage,
    services.chatService.create,
    services.chatService.editMessage,
    services.chatService.deleteMessage,
    services.chatService.addMember,
    services.chatService.leave,
    services.chatService.rename,
    services.chatService.getChat,
    services.chatService.getMessages,
    services.chatService.getChats,
    services.chatService.getMembers,
    services.channelService.sendMessage,
    services.channelService.create,
    services.channelService.update,
    services.channelService.delete,
    services.channelService.join,
    services.channelService.leave,
    services.channelService.editChannelMessage,
    services.channelService.deleteChannelMessage,
    services.channelService.getChannel,
    services.channelService.listChannels,
    services.channelService.getChannelMessages,
    services.channelService.getMembers,
    services.sessionService.start,
    services.sessionService.run,
    services.sessionService.sendMessage,
    services.sessionService.terminate,
    services.sessionService.dismiss,
    services.sessionService.delete,
    services.sessionService.get,
    services.sessionService.list,
    services.inboxService.createItem,
    services.inboxService.listAgentSuggestions,
    services.organizationService.createProject,
    services.organizationService.updateProject,
    services.organizationService.linkEntityToProject,
    services.organizationService.getProject,
    services.organizationService.searchUsers,
    services.organizationService.getUserProfile,
    services.organizationService.listProjects,
    services.organizationService.listRepos,
    services.eventService.query,
    services.projectPlanningService.getContext,
    services.projectPlanningService.askQuestion,
    services.projectPlanningService.recordAnswer,
    services.projectPlanningService.recordDecision,
    services.projectPlanningService.recordRisk,
    services.projectPlanningService.updatePlanSummary,
    services.summaryService.upsert,
    services.memoryService.search,
  ];
}

function getExpectedMock(services: MockedServices, actionType: string): MockFn | undefined {
  const registration = findAction(actionType);
  if (!registration?.service || !registration.method) {
    return undefined;
  }
  return (services as Record<string, Record<string, MockFn>>)[registration.service]?.[
    registration.method
  ];
}

function expectOnlyMockCalled(services: MockedServices, expectedMock: MockFn): void {
  for (const mock of getAllMocks(services)) {
    if (mock === expectedMock) {
      expect(mock).toHaveBeenCalledOnce();
    } else {
      expect(mock).not.toHaveBeenCalled();
    }
  }
}

function expectNoMocksCalled(services: MockedServices): void {
  for (const mock of getAllMocks(services)) {
    expect(mock).not.toHaveBeenCalled();
  }
}

const CANONICAL_EXECUTION_CASES: ExecutionCase[] = [
  {
    actionType: "channel.sendMessage",
    args: { channelId: "chan-1", text: "hello", threadId: "msg-1" },
    assertCall: (services) => {
      expect(services.channelService.sendMessage).toHaveBeenCalledWith(
        "chan-1",
        "hello",
        "msg-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "channel.update",
    args: { channelId: "chan-1", name: "eng-platform-core", baseBranch: "release" },
    assertCall: (services) => {
      expect(services.channelService.update).toHaveBeenCalledWith(
        "chan-1",
        { name: "eng-platform-core", baseBranch: "release" },
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "channel.editMessage",
    args: { messageId: "msg-1", html: "<p>updated</p>" },
    assertCall: (services) => {
      expect(services.channelService.editChannelMessage).toHaveBeenCalledWith({
        messageId: "msg-1",
        html: "<p>updated</p>",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "channel.deleteMessage",
    args: { messageId: "msg-1" },
    assertCall: (services) => {
      expect(services.channelService.deleteChannelMessage).toHaveBeenCalledWith({
        messageId: "msg-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "channel.get",
    args: { channelId: "chan-1" },
    assertCall: (services) => {
      expect(services.channelService.getChannel).toHaveBeenCalledWith("chan-1", "agent-1");
    },
  },
  {
    actionType: "channel.list",
    args: { projectId: "proj-1" },
    assertCall: (services) => {
      expect(services.channelService.listChannels).toHaveBeenCalledWith("org-1", "agent-1", {
        projectId: "proj-1",
      });
    },
  },
  {
    actionType: "channel.listMessages",
    args: { channelId: "chan-1", limit: 99 },
    assertCall: (services) => {
      expect(services.channelService.getChannelMessages).toHaveBeenCalledWith("chan-1", "agent-1", {
        limit: 50,
      });
    },
  },
  {
    actionType: "channel.getMembers",
    args: { channelId: "chan-1" },
    assertCall: (services) => {
      expect(services.channelService.getMembers).toHaveBeenCalledWith("chan-1");
    },
  },
  {
    actionType: "message.send",
    args: { chatId: "chat-1", text: "hello", html: "<p>hello</p>", parentId: "parent-1" },
    assertCall: (services) => {
      expect(services.chatService.sendMessage).toHaveBeenCalledWith({
        chatId: "chat-1",
        text: "hello",
        html: "<p>hello</p>",
        parentId: "parent-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "chat.create",
    args: { memberIds: ["user-1", "user-2"], name: "release war room" },
    assertCall: (services) => {
      expect(services.chatService.create).toHaveBeenCalledWith(
        {
          memberIds: ["user-1", "user-2"],
          name: "release war room",
        },
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "chat.editMessage",
    args: { messageId: "chat-msg-1", html: "<p>edited</p>" },
    assertCall: (services) => {
      expect(services.chatService.editMessage).toHaveBeenCalledWith({
        messageId: "chat-msg-1",
        html: "<p>edited</p>",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "chat.deleteMessage",
    args: { messageId: "chat-msg-1" },
    assertCall: (services) => {
      expect(services.chatService.deleteMessage).toHaveBeenCalledWith({
        messageId: "chat-msg-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "chat.addMember",
    args: { chatId: "chat-1", userId: "user-3" },
    assertCall: (services) => {
      expect(services.chatService.addMember).toHaveBeenCalledWith(
        "chat-1",
        "user-3",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "chat.leave",
    args: { chatId: "chat-1" },
    assertCall: (services) => {
      expect(services.chatService.leave).toHaveBeenCalledWith("chat-1", "agent", "agent-1");
    },
  },
  {
    actionType: "chat.rename",
    args: { chatId: "chat-1", name: "new name" },
    assertCall: (services) => {
      expect(services.chatService.rename).toHaveBeenCalledWith(
        "chat-1",
        "new name",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "chat.get",
    args: { chatId: "chat-1" },
    assertCall: (services) => {
      expect(services.chatService.getChat).toHaveBeenCalledWith("chat-1", "agent-1");
    },
  },
  {
    actionType: "chat.listMessages",
    args: { chatId: "chat-1", limit: 99 },
    assertCall: (services) => {
      expect(services.chatService.getMessages).toHaveBeenCalledWith("chat-1", "agent-1", {
        limit: 50,
      });
    },
  },
  {
    actionType: "chat.list",
    args: {},
    assertCall: (services) => {
      expect(services.chatService.getChats).toHaveBeenCalledWith("agent-1");
    },
  },
  {
    actionType: "chat.getMembers",
    args: { chatId: "chat-1" },
    assertCall: (services) => {
      expect(services.chatService.getMembers).toHaveBeenCalledWith("chat-1");
    },
  },
  {
    actionType: "escalate.toHuman",
    args: {
      userId: "user-1",
      title: "Need human review",
      summary: "The agent is blocked.",
      sourceType: "ticket",
      sourceId: "ticket-1",
    },
    assertCall: (services) => {
      expect(services.inboxService.createItem).toHaveBeenCalledWith({
        orgId: "org-1",
        userId: "user-1",
        itemType: "agent_escalation",
        title: "Need human review",
        summary: "The agent is blocked.",
        sourceType: "ticket",
        sourceId: "ticket-1",
      });
    },
  },
  {
    actionType: "suggestion.query",
    args: { status: "active", limit: 40 },
    assertCall: (services) => {
      expect(services.inboxService.listAgentSuggestions).toHaveBeenCalledWith("org-1", {
        status: "active",
        limit: 25,
      });
    },
  },
  {
    actionType: "events.query",
    args: { scopeType: "channel", scopeId: "chan-1", limit: 80 },
    assertCall: (services) => {
      expect(services.eventService.query).toHaveBeenCalledWith("org-1", {
        scopeType: "channel",
        scopeId: "chan-1",
        limit: 50,
      });
    },
  },
  {
    actionType: "users.search",
    args: { query: "jane" },
    assertCall: (services) => {
      expect(services.organizationService.searchUsers).toHaveBeenCalledWith("jane", "org-1");
    },
  },
  {
    actionType: "users.getProfile",
    args: { userId: "user-1" },
    assertCall: (services) => {
      expect(services.organizationService.getUserProfile).toHaveBeenCalledWith("user-1");
    },
  },
  {
    actionType: "org.listProjects",
    args: { repoId: "repo-1" },
    assertCall: (services) => {
      expect(services.organizationService.listProjects).toHaveBeenCalledWith("org-1", "repo-1");
    },
  },
  {
    actionType: "org.listRepos",
    args: {},
    assertCall: (services) => {
      expect(services.organizationService.listRepos).toHaveBeenCalledWith("org-1");
    },
  },
  {
    actionType: "project.create",
    args: { name: "Project Atlas", repoId: "repo-1" },
    assertCall: (services) => {
      expect(services.organizationService.createProject).toHaveBeenCalledWith(
        {
          name: "Project Atlas",
          organizationId: "org-1",
          repoId: "repo-1",
        },
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "project.linkEntity",
    args: { entityType: "session", entityId: "session-1", projectId: "proj-1" },
    assertCall: (services) => {
      expect(services.organizationService.linkEntityToProject).toHaveBeenCalledWith(
        "session",
        "session-1",
        "proj-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "project.update",
    args: { projectId: "proj-1", name: "Project Atlas v2", aiMode: "suggest" },
    assertCall: (services) => {
      expect(services.organizationService.updateProject).toHaveBeenCalledWith(
        "proj-1",
        "org-1",
        { name: "Project Atlas v2", aiMode: "suggest" },
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "project.get",
    args: { projectId: "proj-1" },
    assertCall: (services) => {
      expect(services.organizationService.getProject).toHaveBeenCalledWith("proj-1", "org-1");
    },
  },
  {
    actionType: "project.askQuestion",
    args: { projectRunId: "run-1", message: "Which repo?" },
    assertCall: (services) => {
      expect(services.projectPlanningService.askQuestion).toHaveBeenCalledWith(
        { projectRunId: "run-1", message: "Which repo?" },
        "org-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "project.recordAnswer",
    args: { projectRunId: "run-1", message: "Use the web app first." },
    assertCall: (services) => {
      expect(services.projectPlanningService.recordAnswer).toHaveBeenCalledWith(
        { projectRunId: "run-1", message: "Use the web app first." },
        "org-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "project.recordDecision",
    args: { projectRunId: "run-1", decision: "Keep ticket generation separate." },
    assertCall: (services) => {
      expect(services.projectPlanningService.recordDecision).toHaveBeenCalledWith(
        { projectRunId: "run-1", decision: "Keep ticket generation separate." },
        "org-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "project.recordRisk",
    args: { projectRunId: "run-1", risk: "Scope may expand." },
    assertCall: (services) => {
      expect(services.projectPlanningService.recordRisk).toHaveBeenCalledWith(
        { projectRunId: "run-1", risk: "Scope may expand." },
        "org-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "project.summarizePlan",
    args: { projectRunId: "run-1", planSummary: "Plan v1", status: "planning" },
    assertCall: (services) => {
      expect(services.projectPlanningService.updatePlanSummary).toHaveBeenCalledWith(
        { projectRunId: "run-1", planSummary: "Plan v1", status: "planning" },
        "org-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "session.start",
    args: {
      prompt: "Fix the flaky build",
      channelId: "chan-1",
      repoId: "repo-1",
      sessionGroupId: "group-1",
      sourceSessionId: "session-0",
      reasoningEffort: "high",
    },
    assertCall: (services) => {
      expect(services.sessionService.start).toHaveBeenCalledWith({
        tool: "claude_code",
        model: undefined,
        reasoningEffort: "high",
        hosting: undefined,
        repoId: "repo-1",
        branch: undefined,
        channelId: "chan-1",
        sessionGroupId: "group-1",
        sourceSessionId: "session-0",
        projectId: undefined,
        prompt: "Fix the flaky build",
        organizationId: "org-1",
        createdById: "agent-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "session.run",
    args: { sessionId: "session-1", prompt: "Continue from the failing test" },
    assertCall: (services) => {
      expect(services.sessionService.run).toHaveBeenCalledWith(
        "session-1",
        "Continue from the failing test",
      );
    },
  },
  {
    actionType: "session.sendMessage",
    args: { sessionId: "session-1", text: "Please focus on auth.ts" },
    assertCall: (services) => {
      expect(services.sessionService.sendMessage).toHaveBeenCalledWith({
        sessionId: "session-1",
        text: "Please focus on auth.ts",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "session.terminate",
    args: { sessionId: "session-1" },
    assertCall: (services) => {
      expect(services.sessionService.terminate).toHaveBeenCalledWith(
        "session-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "session.dismiss",
    args: { sessionId: "session-1" },
    assertCall: (services) => {
      expect(services.sessionService.dismiss).toHaveBeenCalledWith("session-1", "agent", "agent-1");
    },
  },
  {
    actionType: "session.delete",
    args: { sessionId: "session-1" },
    assertCall: (services) => {
      expect(services.sessionService.delete).toHaveBeenCalledWith("session-1", "agent", "agent-1");
    },
  },
  {
    actionType: "session.get",
    args: { sessionId: "session-1" },
    assertCall: (services) => {
      expect(services.sessionService.get).toHaveBeenCalledWith("session-1");
    },
  },
  {
    actionType: "session.list",
    args: {
      agentStatus: "active",
      tool: "codex",
      repoId: "repo-1",
      channelId: "chan-1",
    },
    assertCall: (services) => {
      expect(services.sessionService.list).toHaveBeenCalledWith("org-1", {
        agentStatus: "active",
        tool: "codex",
        repoId: "repo-1",
        channelId: "chan-1",
      });
    },
  },
  {
    actionType: "summary.update",
    args: { entityType: "ticket", entityId: "ticket-1", summary: "New summary" },
    assertCall: (services) => {
      expect(services.summaryService.upsert).toHaveBeenCalledWith({
        entityType: "ticket",
        entityId: "ticket-1",
        summary: "New summary",
        organizationId: "org-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "memory.search",
    args: { query: "auth refactor decision" },
    assertCall: (services) => {
      expect(services.memoryService.search).toHaveBeenCalledWith({
        organizationId: "org-1",
        query: "auth refactor decision",
        subjectType: undefined,
        kind: undefined,
        limit: undefined,
        scopeType: undefined,
        scopeId: undefined,
        isDm: undefined,
      });
    },
  },
  {
    actionType: "no_op",
    args: {},
    assertCall: () => {},
  },
  {
    actionType: "ticket.create",
    args: {
      title: "Login is broken",
      description: "Steps to reproduce",
      priority: "high",
      labels: ["bug", "auth"],
      channelId: "chan-1",
      projectId: "proj-1",
      assigneeIds: ["user-1"],
    },
    assertCall: (services) => {
      expect(services.ticketService.create).toHaveBeenCalledWith({
        organizationId: "org-1",
        title: "Login is broken",
        description: "Steps to reproduce",
        priority: "high",
        labels: ["bug", "auth"],
        channelId: "chan-1",
        projectId: "proj-1",
        assigneeIds: ["user-1"],
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "ticket.update",
    args: { id: "ticket-1", status: "in_review", priority: "urgent", title: "Updated title" },
    assertCall: (services) => {
      expect(services.ticketService.update).toHaveBeenCalledWith(
        "ticket-1",
        { status: "in_review", priority: "urgent", title: "Updated title" },
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "ticket.addComment",
    args: { ticketId: "ticket-1", text: "Investigating now" },
    assertCall: (services) => {
      expect(services.ticketService.addComment).toHaveBeenCalledWith(
        "ticket-1",
        "Investigating now",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "ticket.assign",
    args: { ticketId: "ticket-1", userId: "user-1" },
    assertCall: (services) => {
      expect(services.ticketService.assign).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        userId: "user-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "ticket.unassign",
    args: { ticketId: "ticket-1", userId: "user-1" },
    assertCall: (services) => {
      expect(services.ticketService.unassign).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        userId: "user-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "ticket.link",
    args: { ticketId: "ticket-1", entityType: "session", entityId: "session-1" },
    assertCall: (services) => {
      expect(services.ticketService.link).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        entityType: "session",
        entityId: "session-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "ticket.unlink",
    args: { ticketId: "ticket-1", entityType: "session", entityId: "session-1" },
    assertCall: (services) => {
      expect(services.ticketService.unlink).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        entityType: "session",
        entityId: "session-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
  {
    actionType: "ticket.query",
    args: { query: "login bug", limit: 25 },
    assertCall: (services) => {
      expect(services.ticketService.searchByRelevance).toHaveBeenCalledWith({
        organizationId: "org-1",
        query: "login bug",
        limit: 10,
      });
    },
  },
  {
    actionType: "ticket.get",
    args: { ticketId: "ticket-1" },
    assertCall: (services) => {
      expect(services.ticketService.getById).toHaveBeenCalledWith("org-1", "ticket-1");
    },
  },
];

const ALIAS_EXECUTION_CASES: ExecutionCase[] = [
  {
    actionType: "message.sendToChannel",
    args: { channelId: "chan-1", text: "hello", threadId: "msg-1" },
    assertCall: (services) => {
      expect(services.channelService.sendMessage).toHaveBeenCalledWith(
        "chan-1",
        "hello",
        "msg-1",
        "agent",
        "agent-1",
      );
    },
  },
  {
    actionType: "link.create",
    args: { ticketId: "ticket-1", entityType: "chat", entityId: "chat-1" },
    assertCall: (services) => {
      expect(services.ticketService.link).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        entityType: "chat",
        entityId: "chat-1",
        actorType: "agent",
        actorId: "agent-1",
      });
    },
  },
];

const REQUIRED_FIELD_CASES = CANONICAL_EXECUTION_CASES.map((testCase) => {
  const registration = findAction(testCase.actionType);
  const requiredField = registration
    ? Object.entries(registration.parameters.fields).find(([, field]) => field.required)?.[0]
    : undefined;
  return requiredField ? { ...testCase, requiredField } : null;
}).filter((testCase): testCase is ExecutionCase & { requiredField: string } => testCase !== null);

const PLANNING_ACTION_NAMES = [
  "project.askQuestion",
  "project.recordAnswer",
  "project.recordDecision",
  "project.recordRisk",
  "project.summarizePlan",
];

describe("executor coverage", () => {
  it("defines one execution case for every registered action", () => {
    const expectedActions = getAllActions()
      .map((action) => action.name)
      .sort();
    const coveredActions = CANONICAL_EXECUTION_CASES.map((testCase) => testCase.actionType).sort();

    expect(coveredActions).toEqual(expectedActions);
  });

  it.each(CANONICAL_EXECUTION_CASES)(
    "$actionType dispatches through the expected service method",
    async ({ actionType, args, assertCall }) => {
      const services = createServices();
      const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());
      const expectedMock = getExpectedMock(services, actionType);
      const isPlanningAction = PLANNING_ACTION_NAMES.includes(actionType);
      const scopedContext = isPlanningAction
        ? { scopeType: "project", scopeId: "project-1" }
        : {};

      const result = await executor.execute(
        { actionType, args },
        { ...BASE_CONTEXT, triggerEventId: `evt-${actionType}`, ...scopedContext },
      );

      expect(result).toMatchObject({ status: "success", actionType });

      if (actionType === "no_op") {
        expectNoMocksCalled(services);
        return;
      }

      expect(expectedMock).toBeDefined();
      if (isPlanningAction) {
        expect(services.projectPlanningService.getContext).toHaveBeenCalledOnce();
        expect(expectedMock).toHaveBeenCalledOnce();
      } else {
        expectOnlyMockCalled(services, expectedMock!);
      }
      assertCall(services);
    },
  );

  it.each(ALIAS_EXECUTION_CASES)(
    "$actionType alias dispatches through the canonical service method",
    async ({ actionType, args, assertCall }) => {
      const services = createServices();
      const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());
      const expectedMock = getExpectedMock(services, actionType);

      const result = await executor.execute(
        { actionType, args },
        { ...BASE_CONTEXT, triggerEventId: `evt-${actionType}` },
      );

      expect(result).toMatchObject({ status: "success", actionType });
      expect(expectedMock).toBeDefined();
      expectOnlyMockCalled(services, expectedMock!);
      assertCall(services);
    },
  );

  it.each(REQUIRED_FIELD_CASES)(
    "$actionType rejects requests missing required field $requiredField",
    async ({ actionType, args, requiredField }) => {
      const services = createServices();
      const executor = new ActionExecutor(services, new InMemoryIdempotencyStore());
      const invalidArgs = { ...args };
      delete invalidArgs[requiredField];
      const scopedContext = PLANNING_ACTION_NAMES.includes(actionType)
        ? { scopeType: "project", scopeId: "project-1" }
        : {};

      const result = await executor.execute(
        { actionType, args: invalidArgs },
        { ...BASE_CONTEXT, triggerEventId: `evt-missing-${actionType}`, ...scopedContext },
      );

      expect(result.status).toBe("failed");
      expect(result.actionType).toBe(actionType);
      expect(result.error).toContain(`Missing required field: ${requiredField}`);
      expectNoMocksCalled(services);
    },
  );
});
