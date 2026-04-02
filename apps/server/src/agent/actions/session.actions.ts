/**
 * Session domain actions — start, run, sendMessage, terminate, dismiss, delete, get
 */

import type { AgentActionRegistration, ActionDispatcher, StartSessionServiceInput } from "./types.js";
import { actorInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const sessionActions: AgentActionRegistration[] = [
  {
    name: "session.start",
    service: "sessionService",
    method: "start",
    description:
      "Start a new coding session. This is a high-risk action — only use when there is a clear, well-defined task that requires a coding session and high confidence it will be useful.",
    catalogDescription: "Start/launch/create a new coding session (prompt, channelId, repoId, tool)",
    risk: "high",
    suggestable: true,
    tier: "core",
    parameters: {
      fields: {
        prompt: { type: "string", description: "The task description / prompt for the session", required: true },
        channelId: { type: "string", description: "Channel to associate the session with" },
        repoId: { type: "string", description: "Repository to work in" },
        tool: {
          type: "string",
          description: "Coding tool to use",
          enum: ["claude_code", "codex", "custom"],
        },
        sessionGroupId: { type: "string", description: "Existing session group to add the session to" },
        sourceSessionId: { type: "string", description: "Session to copy context/workdir from when starting the new session" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session"],
  },
  {
    name: "session.run",
    service: "sessionService",
    method: "run",
    description:
      "Resume a paused or completed session with a new prompt. Use to continue work on an existing session.",
    catalogDescription: "Resume/continue/run a session with a new prompt (sessionId, prompt)",
    risk: "high",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        sessionId: { type: "string", description: "The session to resume", required: true },
        prompt: { type: "string", description: "New prompt/instructions for the session" },
      },
    },
    scopes: ["session", "channel", "chat"],
  },
  {
    name: "session.sendMessage",
    service: "sessionService",
    method: "sendMessage",
    description:
      "Send a follow-up message to a running session. Use to provide additional context or instructions.",
    catalogDescription: "Send/post a message to a running session (sessionId, text)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        sessionId: { type: "string", description: "The session to message", required: true },
        text: { type: "string", description: "Message text", required: true },
      },
    },
    scopes: ["session", "channel", "chat"],
  },
  {
    name: "session.terminate",
    service: "sessionService",
    method: "terminate",
    description:
      "Stop a running session. Use when a session is stuck, no longer needed, or should be cancelled.",
    catalogDescription: "Stop/end/kill/terminate a running session (sessionId)",
    risk: "high",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        sessionId: { type: "string", description: "The session to terminate", required: true },
      },
    },
    scopes: ["session", "channel", "chat"],
  },
  {
    name: "session.dismiss",
    service: "sessionService",
    method: "dismiss",
    description:
      "Dismiss/archive a completed session. Use to clean up sessions that are done.",
    catalogDescription: "Dismiss/archive a completed session (sessionId)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        sessionId: { type: "string", description: "The session to dismiss", required: true },
      },
    },
    scopes: ["session", "channel"],
  },
  {
    name: "session.delete",
    service: "sessionService",
    method: "delete",
    description:
      "Delete a session permanently. This is a destructive action.",
    catalogDescription: "Delete/remove a session permanently (sessionId)",
    risk: "high",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        sessionId: { type: "string", description: "The session to delete", required: true },
      },
    },
    scopes: ["session"],
  },
  {
    name: "session.get",
    service: "sessionService",
    method: "get",
    description:
      "Get details about a specific session including status, tool, and associated entities.",
    catalogDescription: "Fetch/read/view session details (sessionId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        sessionId: { type: "string", description: "The session to look up", required: true },
      },
    },
    scopes: ["session", "channel", "chat", "ticket"],
  },
  {
    name: "session.list",
    service: "sessionService",
    method: "list",
    description:
      "List sessions in the organization. Optionally filter by status, tool, repo, or channel.",
    catalogDescription: "List/browse sessions (agentStatus, tool, repoId, channelId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        agentStatus: {
          type: "string",
          description: "Filter by agent status",
          enum: ["not_started", "active", "done", "failed", "stopped"],
        },
        tool: { type: "string", description: "Filter by coding tool" },
        repoId: { type: "string", description: "Filter by repository ID" },
        channelId: { type: "string", description: "Filter by channel ID" },
      },
    },
    scopes: ["session", "channel", "chat", "ticket", "project"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const sessionDispatchers: Record<string, ActionDispatcher> = {
  "session.start": (services, args, ctx) => {
    return services.sessionService.start({
      tool: (args.tool as StartSessionServiceInput["tool"] | undefined) ?? "claude_code",
      model: args.model as string | undefined,
      hosting: args.hosting as StartSessionServiceInput["hosting"],
      repoId: args.repoId as string | undefined,
      branch: args.branch as string | undefined,
      channelId: args.channelId as string | undefined,
      sessionGroupId: args.sessionGroupId as string | undefined,
      sourceSessionId: args.sourceSessionId as string | undefined,
      projectId: args.projectId as string | undefined,
      prompt: args.prompt as string | undefined,
      organizationId: ctx.organizationId,
      createdById: ctx.agentId,
    });
  },

  "session.run": (services, args) => {
    return services.sessionService.run(
      args.sessionId as string,
      args.prompt as string | undefined,
    );
  },

  "session.sendMessage": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.sessionService.sendMessage({
      sessionId: args.sessionId as string,
      text: args.text as string,
      actorType,
      actorId,
    });
  },

  "session.terminate": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.sessionService.terminate(args.sessionId as string, actorType, actorId);
  },

  "session.dismiss": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.sessionService.dismiss(args.sessionId as string, actorType, actorId);
  },

  "session.delete": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.sessionService.delete(args.sessionId as string, actorType, actorId);
  },

  "session.get": (services, args) => {
    return services.sessionService.get(args.sessionId as string);
  },

  "session.list": (services, args, ctx) => {
    return services.sessionService.list(ctx.organizationId, {
      agentStatus: args.agentStatus as string | undefined,
      tool: args.tool as string | undefined,
      repoId: args.repoId as string | undefined,
      channelId: args.channelId as string | undefined,
    });
  },
};
