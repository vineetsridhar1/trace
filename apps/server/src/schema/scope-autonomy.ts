/**
 * GraphQL resolvers for per-scope autonomy settings.
 * Ticket: #20
 */

import type { AutonomyMode } from "@prisma/client";
import type { Context } from "../context.js";
import { resolveAutonomyMode, updateScopeAiMode } from "../services/scope-autonomy.js";
import { agentIdentityService } from "../services/agent-identity.js";
import { orgMemberService } from "../services/org-member.js";
import { prisma } from "../lib/db.js";

export const scopeAutonomyQueries = {
  resolvedAiMode: async (
    _: unknown,
    args: { organizationId: string; scopeType: string; scopeId: string },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);

    const agentSettings = await agentIdentityService.getOrCreate(args.organizationId);

    // Determine isDm for chat scopes
    let isDm = false;
    if (args.scopeType === "chat") {
      const chat = await prisma.chat.findUnique({
        where: { id: args.scopeId },
        select: { type: true },
      });
      isDm = chat?.type === "dm";
    }

    return resolveAutonomyMode({
      scopeType: args.scopeType,
      scopeId: args.scopeId,
      organizationId: args.organizationId,
      isDm,
      orgDefault: agentSettings.autonomyMode,
    });
  },
};

export const scopeAutonomyMutations = {
  updateScopeAiMode: async (
    _: unknown,
    args: { organizationId: string; scopeType: string; scopeId: string; aiMode: AutonomyMode | null },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);

    await updateScopeAiMode({
      scopeType: args.scopeType,
      scopeId: args.scopeId,
      aiMode: args.aiMode ?? null,
    });

    return true;
  },
};
