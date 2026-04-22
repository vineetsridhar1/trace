import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { connectionsService } from "../services/connections.js";

export const connectionsQueries = {
  myConnections: (_parent: unknown, _args: unknown, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return connectionsService.listMine({
      userId: ctx.userId,
      organizationId: requireOrgContext(ctx),
    });
  },
};
