import type { OrgAgentStatus, AutonomyMode } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";

export interface OrgAgentSettings {
  agentId: string;
  organizationId: string;
  name: string;
  status: OrgAgentStatus;
  autonomyMode: AutonomyMode;
  soulFile: string;
  costBudget: {
    dailyLimitCents: number;
  };
}

export class AgentIdentityService {
  /**
   * Get or create the agent identity for an organization.
   * Every org gets exactly one agent identity (1:1 relation).
   */
  async getOrCreate(organizationId: string): Promise<OrgAgentSettings> {
    const identity = await prisma.agentIdentity.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });

    return this.toSettings(identity);
  }

  /**
   * Get the agent identity for an org. Returns null if not found.
   */
  async get(organizationId: string): Promise<OrgAgentSettings | null> {
    const identity = await prisma.agentIdentity.findUnique({
      where: { organizationId },
    });

    return identity ? this.toSettings(identity) : null;
  }

  /**
   * Load agent identities for multiple orgs at once.
   * Returns a map of orgId -> OrgAgentSettings.
   */
  async loadAll(): Promise<Map<string, OrgAgentSettings>> {
    const identities = await prisma.agentIdentity.findMany();
    const map = new Map<string, OrgAgentSettings>();

    for (const identity of identities) {
      map.set(identity.organizationId, this.toSettings(identity));
    }

    return map;
  }

  /**
   * Update agent settings for an org.
   */
  async update(
    organizationId: string,
    updates: {
      name?: string;
      status?: OrgAgentStatus;
      autonomyMode?: AutonomyMode;
      soulFile?: string;
      dailyLimitCents?: number;
    },
  ): Promise<OrgAgentSettings> {
    const identity = await prisma.agentIdentity.update({
      where: { organizationId },
      data: updates,
    });

    return this.toSettings(identity);
  }

  private toSettings(identity: {
    id: string;
    organizationId: string;
    name: string;
    status: OrgAgentStatus;
    autonomyMode: AutonomyMode;
    soulFile: string;
    dailyLimitCents: number;
  }): OrgAgentSettings {
    return {
      agentId: TRACE_AI_USER_ID,
      organizationId: identity.organizationId,
      name: identity.name,
      status: identity.status,
      autonomyMode: identity.autonomyMode,
      soulFile: identity.soulFile,
      costBudget: {
        dailyLimitCents: identity.dailyLimitCents,
      },
    };
  }
}

export const agentIdentityService = new AgentIdentityService();
