import type { Context } from "../context.js";
import { terminalService } from "../services/terminal.js";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";

export const terminalQueries = {
  sessionTerminals: async (_parent: unknown, args: { sessionId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.listForSession({
      sessionId: args.sessionId,
      organizationId: requireOrgContext(ctx),
      userId: ctx.userId,
      agentSessionId: ctx.agentSessionId,
    });
  },
  terminalCapture: async (
    _parent: unknown,
    args: { terminalId: string; maxBytes?: number | null; plainText?: boolean | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.capture({ ...args, organizationId: requireOrgContext(ctx), userId: ctx.userId, agentSessionId: ctx.agentSessionId });
  },
  channelTerminals: async (
    _parent: unknown,
    args: { channelId: string; bridgeRuntimeId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.listForChannel({
      channelId: args.channelId,
      bridgeRuntimeId: args.bridgeRuntimeId,
      organizationId: requireOrgContext(ctx),
      userId: ctx.userId,
    });
  },
};

export const terminalMutations = {
  createTerminal: async (
    _parent: unknown,
    args: { sessionId: string; cols: number; rows: number; clientMutationId?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.create({
      sessionId: args.sessionId,
      cols: args.cols,
      rows: args.rows,
      clientMutationId: args.clientMutationId ?? undefined,
      organizationId: requireOrgContext(ctx),
      userId: ctx.userId,
      actorType: ctx.actorType,
      agentSessionId: ctx.agentSessionId,
    });
  },

  createChannelTerminal: async (
    _parent: unknown,
    args: { channelId: string; bridgeRuntimeId: string; cols: number; rows: number },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.createForChannel({
      channelId: args.channelId,
      bridgeRuntimeId: args.bridgeRuntimeId,
      cols: args.cols,
      rows: args.rows,
      organizationId: requireOrgContext(ctx),
      userId: ctx.userId,
    });
  },

  destroyTerminal: async (_parent: unknown, args: { terminalId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.destroy({
      terminalId: args.terminalId,
      organizationId: requireOrgContext(ctx),
      userId: ctx.userId,
      actorType: ctx.actorType,
      agentSessionId: ctx.agentSessionId,
    });
  },
  sendTerminalInput: async (_parent: unknown, args: { terminalId: string; data: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.sendInput({ ...args, organizationId: requireOrgContext(ctx), userId: ctx.userId, agentSessionId: ctx.agentSessionId });
  },
  resizeTerminal: async (_parent: unknown, args: { terminalId: string; cols: number; rows: number }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.resize({ ...args, organizationId: requireOrgContext(ctx), userId: ctx.userId, agentSessionId: ctx.agentSessionId });
  },
};
