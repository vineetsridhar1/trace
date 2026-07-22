import type { CreateDesignSystemInput } from "@trace/gql";
import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";
import { designSystemService } from "../services/design-system.js";

function actor(ctx: Context) {
  if (!ctx.userId) throw new AuthenticationError();
  return { actorType: "user" as const, actorId: ctx.userId };
}

export const designSystemQueries = {
  designSystems: (
    _: unknown,
    args: { organizationId: string; includeArchived?: boolean | null },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.organizationId);
    return designSystemService.list({
      organizationId: args.organizationId,
      ...actor(ctx),
      includeArchived: args.includeArchived ?? false,
    });
  },
  designSystem: (_: unknown, args: { id: string }, ctx: Context) =>
    designSystemService.get({ id: args.id, organizationId: requireOrgContext(ctx), ...actor(ctx) }),
  designSystemCommitArtifacts: (
    _: unknown,
    args: { designSystemId: string; first?: number | null; after?: string | null },
    ctx: Context,
  ) =>
    designSystemService.listCommitArtifacts({
      designSystemId: args.designSystemId,
      organizationId: requireOrgContext(ctx),
      ...actor(ctx),
      first: args.first ?? undefined,
      after: args.after,
    }),
  designSystemVersions: (_: unknown, args: { designSystemId: string }, ctx: Context) =>
    designSystemService.listVersions({
      designSystemId: args.designSystemId,
      organizationId: requireOrgContext(ctx),
      ...actor(ctx),
    }),
};

export const designSystemMutations = {
  createDesignSystem: (_: unknown, args: { input: CreateDesignSystemInput }, ctx: Context) =>
    designSystemService.create({
      organizationId: requireOrgContext(ctx),
      ...actor(ctx),
      name: args.input.name,
      repoId: args.input.repoId,
      branch: args.input.branch,
      sourcePath: args.input.sourcePath,
      environmentId: args.input.environmentId,
    }),
  saveDesignSystem: (_: unknown, args: { id: string }, ctx: Context) =>
    designSystemService.save({
      id: args.id,
      organizationId: requireOrgContext(ctx),
      ...actor(ctx),
    }),
  retryDesignSystemCommitArtifact: (_: unknown, args: { designSystemId: string }, ctx: Context) =>
    designSystemService.retryCommitArtifact({
      designSystemId: args.designSystemId,
      organizationId: requireOrgContext(ctx),
      ...actor(ctx),
    }),
  refreshDesignSystemSource: (_: unknown, args: { id: string }, ctx: Context) =>
    designSystemService.refreshSource({
      id: args.id,
      organizationId: requireOrgContext(ctx),
      ...actor(ctx),
    }),
  archiveDesignSystem: (_: unknown, args: { id: string }, ctx: Context) =>
    designSystemService.archive({
      id: args.id,
      organizationId: requireOrgContext(ctx),
      ...actor(ctx),
    }),
};
