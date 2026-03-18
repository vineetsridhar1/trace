import type { Context } from "../context.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { prisma } from "../lib/db.js";
import { AuthenticationError } from "../lib/errors.js";

export const terminalMutations = {
  createTerminal: async (
    _parent: unknown,
    args: { sessionId: string; cols: number; rows: number },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();

    // Verify the session exists and belongs to the user's org
    const session = await prisma.session.findFirst({
      where: { id: args.sessionId, organizationId: ctx.organizationId },
      select: { id: true, workdir: true },
    });
    if (!session) throw new Error("Session not found");

    const terminalId = terminalRelay.createTerminal(
      args.sessionId,
      args.cols,
      args.rows,
      session.workdir ?? undefined,
    );
    return { id: terminalId, sessionId: args.sessionId };
  },

  destroyTerminal: async (
    _parent: unknown,
    args: { terminalId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();

    // Verify the terminal belongs to a session in the user's org
    const sessionId = terminalRelay.getSessionId(args.terminalId);
    if (sessionId) {
      const session = await prisma.session.findFirst({
        where: { id: sessionId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!session) throw new Error("Terminal not found");
    }

    terminalRelay.destroyTerminal(args.terminalId);
    return true;
  },
};
