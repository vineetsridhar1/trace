import type { Context } from "../context.js";
import { orgSecretService } from "../services/org-secret.js";

export const orgSecretQueries = {
  orgSecrets: (_: unknown, args: { orgId: string }, ctx: Context) => {
    return orgSecretService.list(args.orgId, ctx.actorType, ctx.userId);
  },
};

export const orgSecretTypeResolvers = {
  OrgSecret: {
    orgId: (secret: { organizationId: string }) => secret.organizationId,
  },
};
