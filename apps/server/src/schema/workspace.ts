import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { workspaceService } from "../services/workspace.js";

export const workspaceMutations = {
  openWorkspaceBrowser: async (
    _parent: unknown,
    args: { sessionGroupId: string; url: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return workspaceService.openBrowser({
      ...args,
      organizationId: requireOrgContext(ctx),
      userId: ctx.userId,
      actorType: ctx.actorType,
    });
  },
};
