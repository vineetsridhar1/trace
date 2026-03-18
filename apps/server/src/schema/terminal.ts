import type { Context } from "../context.js";
import { terminalService } from "../services/terminal.js";
import { AuthenticationError } from "../lib/errors.js";

export const terminalQueries = {
  sessionTerminals: async (
    _parent: unknown,
    args: { sessionId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.listForSession({
      sessionId: args.sessionId,
      organizationId: ctx.organizationId,
    });
  },
};

export const terminalMutations = {
  createTerminal: async (
    _parent: unknown,
    args: { sessionId: string; cols: number; rows: number },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.create({
      sessionId: args.sessionId,
      cols: args.cols,
      rows: args.rows,
      organizationId: ctx.organizationId,
    });
  },

  destroyTerminal: async (
    _parent: unknown,
    args: { terminalId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return terminalService.destroy({
      terminalId: args.terminalId,
      organizationId: ctx.organizationId,
    });
  },
};
