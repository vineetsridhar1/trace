/**
 * GraphQL resolvers for per-scope autonomy settings.
 * Ticket: #20
 */

import type { AutonomyMode } from "@prisma/client";
import type { Context } from "../context.js";
import {
  getChatAutonomyContext,
  resolveAutonomyMode,
  updateScopeAiMode,
  type AutonomyScopeType,
  type WritableAiModeScopeType,
} from "../services/scope-autonomy.js";
import { agentIdentityService } from "../services/agent-identity.js";
import { orgMemberService } from "../services/org-member.js";
import { assertOrgAccess } from "../lib/require-org.js";
import { assertScopeAccess } from "../services/access.js";

const VALID_RESOLVE_SCOPES = new Set<string>(["chat", "ticket", "channel", "session", "project"]);
const VALID_WRITE_SCOPES = new Set<string>(["chat", "ticket", "channel", "project"]);

export const scopeAutonomyQueries = {
  resolvedAiMode: async (
    _: unknown,
    args: { organizationId: string; scopeType: string; scopeId: string },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.organizationId);
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    if (!VALID_RESOLVE_SCOPES.has(args.scopeType)) {
      throw new Error(`Invalid scope type: ${args.scopeType}`);
    }

    const scopeType = args.scopeType as AutonomyScopeType;
    await assertScopeAccess(scopeType, args.scopeId, ctx.userId, args.organizationId);
    const agentSettings = await agentIdentityService.getOrCreate(args.organizationId);

    // For chat scopes, fetch both aiMode and type in a single query
    let isDm = false;
    let prefetchedAiMode: AutonomyMode | null | undefined;
    if (scopeType === "chat") {
      const chat = await getChatAutonomyContext(args.scopeId);
      isDm = chat.isDm;
      prefetchedAiMode = chat.aiMode;
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
    args: {
      organizationId: string;
      scopeType: string;
      scopeId: string;
      aiMode: AutonomyMode | null;
    },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.organizationId);
    if (!VALID_WRITE_SCOPES.has(args.scopeType)) {
      throw new Error(`Cannot set aiMode on scope type: ${args.scopeType}`);
    }

    await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, args.organizationId);
    await updateScopeAiMode({
      scopeType: args.scopeType as WritableAiModeScopeType,
      scopeId: args.scopeId,
      aiMode: args.aiMode ?? null,
      userId: ctx.userId,
      organizationId: args.organizationId,
    });

    return true;
  },
};
