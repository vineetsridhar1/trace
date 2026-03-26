/**
 * GraphQL resolvers for per-scope autonomy settings.
 * Ticket: #20
 */

import type { AutonomyMode } from "@prisma/client";
import type { Context } from "../context.js";
import {
  resolveAutonomyMode,
  updateScopeAiMode,
  type AutonomyScopeType,
  type WritableAiModeScopeType,
} from "../services/scope-autonomy.js";
import { agentIdentityService } from "../services/agent-identity.js";
import { orgMemberService } from "../services/org-member.js";
import { prisma } from "../lib/db.js";

const VALID_RESOLVE_SCOPES = new Set<string>(["chat", "ticket", "channel", "session", "project"]);
const VALID_WRITE_SCOPES = new Set<string>(["chat", "ticket", "channel", "project"]);

export const scopeAutonomyQueries = {
  resolvedAiMode: async (
    _: unknown,
    args: { organizationId: string; scopeType: string; scopeId: string },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    if (!VALID_RESOLVE_SCOPES.has(args.scopeType)) {
      throw new Error(`Invalid scope type: ${args.scopeType}`);
    }

    const scopeType = args.scopeType as AutonomyScopeType;
    const agentSettings = await agentIdentityService.getOrCreate(args.organizationId);

    // For chat scopes, fetch both aiMode and type in a single query
    let isDm = false;
    let prefetchedAiMode: AutonomyMode | null | undefined;
    if (scopeType === "chat") {
      const chat = await prisma.chat.findUnique({
        where: { id: args.scopeId },
        select: { type: true, aiMode: true },
      });
      isDm = chat?.type === "dm";
      prefetchedAiMode = chat?.aiMode ?? null;
    }

    return resolveAutonomyMode({
      scopeType,
      scopeId: args.scopeId,
      organizationId: args.organizationId,
      isDm,
      orgDefault: agentSettings.autonomyMode,
      prefetchedAiMode,
    });
  },
};

export const scopeAutonomyMutations = {
  updateScopeAiMode: async (
    _: unknown,
    args: { organizationId: string; scopeType: string; scopeId: string; aiMode: AutonomyMode | null },
    ctx: Context,
  ) => {
    await orgMemberService.assertAdmin(ctx.userId, args.organizationId);
    if (!VALID_WRITE_SCOPES.has(args.scopeType)) {
      throw new Error(`Cannot set aiMode on scope type: ${args.scopeType}`);
    }

    await updateScopeAiMode({
      scopeType: args.scopeType as WritableAiModeScopeType,
      scopeId: args.scopeId,
      aiMode: args.aiMode ?? null,
    });

    return true;
  },
};
