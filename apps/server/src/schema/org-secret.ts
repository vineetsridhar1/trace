import type { Context } from "../context.js";
import type { SetOrgSecretInput } from "@trace/gql";
import { orgSecretService } from "../services/org-secret.js";

export const orgSecretQueries = {
  orgSecrets: (_: unknown, args: { orgId: string }, ctx: Context) => {
    return orgSecretService.list(args.orgId, ctx.actorType, ctx.userId);
  },
};

export const orgSecretMutations = {
  setOrgSecret: (_: unknown, args: { input: SetOrgSecretInput }, ctx: Context) => {
    return orgSecretService.set(
      args.input.orgId,
      args.input.name,
      args.input.value,
      ctx.actorType,
      ctx.userId,
    );
  },
  deleteOrgSecret: (_: unknown, args: { orgId: string; id: string }, ctx: Context) => {
    return orgSecretService.delete(args.orgId, args.id, ctx.actorType, ctx.userId);
  },
};

export const orgSecretTypeResolvers = {
  OrgSecret: {
    orgId: (secret: { organizationId: string }) => secret.organizationId,
  },
};
