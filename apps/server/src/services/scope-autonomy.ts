/**
 * Scope Autonomy Resolution — resolves the effective autonomy mode for a scope
 * by applying the override hierarchy:
 *
 *   1. Scope-level override (chat/ticket/channel aiMode if set)
 *   2. Project-level override (if scope belongs to a project with aiMode set)
 *   3. Chat-type defaults (DMs and group chats → suggest)
 *   4. Org-level default (AgentIdentity.autonomyMode)
 *
 * Ticket: #20
 */

import type { AutonomyMode } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { orgMemberService } from "./org-member.js";

/** Scope types that support aiMode overrides or participate in resolution. */
export type AutonomyScopeType = "chat" | "ticket" | "channel" | "session" | "project";

export interface ResolveAutonomyInput {
  scopeType: AutonomyScopeType;
  scopeId: string;
  organizationId: string;
  /** Whether this scope is a DM chat. Used for chat-type defaults. */
  isDm?: boolean;
  /** Org-level default autonomy mode from AgentIdentity. */
  orgDefault: AutonomyMode;
  /**
   * Pre-fetched scope-level aiMode override. When provided, skips the DB
   * lookup for the scope entity's aiMode. Use `undefined` to force a fresh
   * lookup, or `null` to indicate "already checked, no override set".
   */
  prefetchedAiMode?: AutonomyMode | null;
}

export async function getChatAutonomyContext(chatId: string): Promise<{
  isDm: boolean;
  aiMode: AutonomyMode | null;
}> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true, aiMode: true },
  });

  return {
    isDm: chat?.type === "dm",
    aiMode: chat?.aiMode ?? null,
  };
}

/**
 * Resolve the effective autonomy mode for a scope by walking the override
 * hierarchy. Returns the most specific non-null override, or falls back to
 * chat-type defaults and then the org default.
 */
export async function resolveAutonomyMode(input: ResolveAutonomyInput): Promise<AutonomyMode> {
  const { scopeType, scopeId, organizationId, isDm, orgDefault, prefetchedAiMode } = input;

  // 1. Scope-level override
  const scopeOverride = prefetchedAiMode !== undefined
    ? prefetchedAiMode
    : await getScopeAiMode(scopeType, scopeId);
  if (scopeOverride) return scopeOverride;

  // 2. Project-level override (if scope belongs to a project)
  const projectOverride = await getProjectOverride(scopeType, scopeId, organizationId);
  if (projectOverride) return projectOverride;

  // 3. Chat-type defaults: DMs → act (always respond), group chats → suggest
  if (scopeType === "chat") {
    return isDm ? "act" : "suggest";
  }

  // 4. Org-level default
  return orgDefault;
}

/**
 * Read the aiMode directly set on a scope entity.
 * Returns null if the scope type doesn't support aiMode or if it's not set.
 */
async function getScopeAiMode(scopeType: AutonomyScopeType, scopeId: string): Promise<AutonomyMode | null> {
  switch (scopeType) {
    case "chat": {
      const chat = await prisma.chat.findUnique({
        where: { id: scopeId },
        select: { aiMode: true },
      });
      return chat?.aiMode ?? null;
    }
    case "ticket": {
      const ticket = await prisma.ticket.findUnique({
        where: { id: scopeId },
        select: { aiMode: true },
      });
      return ticket?.aiMode ?? null;
    }
    case "channel": {
      const channel = await prisma.channel.findUnique({
        where: { id: scopeId },
        select: { aiMode: true },
      });
      return channel?.aiMode ?? null;
    }
    default:
      return null;
  }
}

/**
 * Find the project-level aiMode override for a scope entity.
 * Walks the project links for the entity and returns the most restrictive
 * (lowest autonomy) mode if multiple projects have overrides.
 */
async function getProjectOverride(
  scopeType: AutonomyScopeType,
  scopeId: string,
  organizationId: string,
): Promise<AutonomyMode | null> {
  let projectIds: string[] = [];

  switch (scopeType) {
    case "ticket": {
      const links = await prisma.ticketProject.findMany({
        where: { ticketId: scopeId },
        select: { projectId: true },
      });
      projectIds = links.map((l) => l.projectId);
      break;
    }
    case "channel": {
      const links = await prisma.channelProject.findMany({
        where: { channelId: scopeId },
        select: { projectId: true },
      });
      projectIds = links.map((l) => l.projectId);
      break;
    }
    case "session": {
      const links = await prisma.sessionProject.findMany({
        where: { sessionId: scopeId },
        select: { projectId: true },
      });
      projectIds = links.map((l) => l.projectId);
      break;
    }
    case "chat": {
      // Chats aren't directly linked to projects
      return null;
    }
    default:
      return null;
  }

  if (projectIds.length === 0) return null;

  const projects = await prisma.project.findMany({
    where: {
      id: { in: projectIds },
      organizationId,
      aiMode: { not: null },
    },
    select: { aiMode: true },
  });

  if (projects.length === 0) return null;

  // If multiple projects have overrides, pick the most restrictive
  const MODE_RANK: Record<string, number> = { observe: 0, suggest: 1, act: 2 };
  let mostRestrictive = projects[0].aiMode!;

  for (const p of projects) {
    if ((MODE_RANK[p.aiMode!] ?? 2) < (MODE_RANK[mostRestrictive] ?? 2)) {
      mostRestrictive = p.aiMode!;
    }
  }

  return mostRestrictive;
}

/** Scope types that support direct aiMode writes. */
export type WritableAiModeScopeType = "chat" | "ticket" | "channel" | "project";

/**
 * Update the aiMode on a scope entity. Pass null to clear the override
 * (inherit from parent/org default).
 *
 * Requires admin membership in the organization. The `userId` and
 * `organizationId` params are used for authorization so that this function
 * is safe to call from any entry point (GraphQL, agent runtime, etc.).
 */
export async function updateScopeAiMode(input: {
  scopeType: WritableAiModeScopeType;
  scopeId: string;
  aiMode: AutonomyMode | null;
  userId: string;
  organizationId: string;
}): Promise<void> {
  await orgMemberService.assertAdmin(input.userId, input.organizationId);
  const { scopeType, scopeId, aiMode } = input;

  switch (scopeType) {
    case "chat":
      await prisma.chat.update({ where: { id: scopeId }, data: { aiMode } });
      break;
    case "ticket":
      await prisma.ticket.update({ where: { id: scopeId }, data: { aiMode } });
      break;
    case "channel":
      await prisma.channel.update({ where: { id: scopeId }, data: { aiMode } });
      break;
    case "project":
      await prisma.project.update({ where: { id: scopeId }, data: { aiMode } });
      break;
    default:
      throw new Error(`Cannot set aiMode on scope type: ${scopeType as string}`);
  }
}
