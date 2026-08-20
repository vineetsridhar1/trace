import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { browserLiveViewService } from "../services/browser-live-view.js";

export const browserLiveViewQueries = {
  browserLiveFrame: (
    _parent: unknown,
    args: { sessionId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return browserLiveViewService.frame({
      sessionId: args.sessionId,
      organizationId: requireOrgContext(ctx),
      userId: ctx.userId,
    });
  },
};
