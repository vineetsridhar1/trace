import type { ActorType } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

const ADAPTER_TYPES = new Set(["local", "provisioned"]);
const RAW_SECRET_KEYS = new Set([
  "apikey",
  "authorization",
  "bearertoken",
  "password",
  "refreshtoken",
  "secret",
  "token",
]);

type TxClient = Prisma.TransactionClient;

type AgentEnvironmentInput = {
  organizationId: string;
  name: string;
  adapterType: string;
  config?: Prisma.InputJsonValue;
  enabled?: boolean;
  isDefault?: boolean;
};

type AgentEnvironmentUpdateInput = Partial<Omit<AgentEnvironmentInput, "organizationId">>;

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("Agent environment name is required");
  return normalized;
}

function assertSupportedAdapter(adapterType: string): void {
  if (!ADAPTER_TYPES.has(adapterType)) {
    throw new Error("Agent environment adapterType must be local or provisioned");
  }
}

function assertConfigHasNoRawSecrets(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(assertConfigHasNoRawSecrets);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
    if (RAW_SECRET_KEYS.has(normalizedKey) && typeof child === "string" && child.trim()) {
      throw new Error("Agent environment config cannot store raw secrets; reference an OrgSecret");
    }
    assertConfigHasNoRawSecrets(child);
  }
}

function environmentPayload(environment: {
  id: string;
  organizationId: string;
  name: string;
  adapterType: string;
  config: Prisma.JsonValue;
  enabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Prisma.InputJsonObject {
  return {
    id: environment.id,
    organizationId: environment.organizationId,
    name: environment.name,
    adapterType: environment.adapterType,
    config: environment.config as Prisma.InputJsonValue,
    enabled: environment.enabled,
    isDefault: environment.isDefault,
    createdAt: environment.createdAt.toISOString(),
    updatedAt: environment.updatedAt.toISOString(),
  };
}

export class AgentEnvironmentService {
  async list(organizationId: string) {
    return prisma.agentEnvironment.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  async create(input: AgentEnvironmentInput, actorType: ActorType, actorId: string) {
    const name = normalizeName(input.name);
    assertSupportedAdapter(input.adapterType);
    assertConfigHasNoRawSecrets(input.config);

    const environment = await prisma.$transaction(async (tx: TxClient) => {
      await this.lockOrganizationDefaults(tx, input.organizationId);
      const enabled = input.enabled ?? true;
      const isDefault = enabled && input.isDefault === true;
      if (isDefault) {
        await tx.agentEnvironment.updateMany({
          where: { organizationId: input.organizationId, enabled: true, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.agentEnvironment.create({
        data: {
          organizationId: input.organizationId,
          name,
          adapterType: input.adapterType,
          config: input.config ?? {},
          enabled,
          isDefault,
        },
      });
    });

    await eventService.create({
      organizationId: environment.organizationId,
      scopeType: "system",
      scopeId: environment.organizationId,
      eventType: "agent_environment_created",
      payload: { agentEnvironment: environmentPayload(environment) },
      actorType,
      actorId,
    });

    return environment;
  }

  async update(
    id: string,
    organizationId: string,
    input: AgentEnvironmentUpdateInput,
    actorType: ActorType,
    actorId: string,
  ) {
    if (input.name !== undefined) normalizeName(input.name);
    if (input.adapterType !== undefined) assertSupportedAdapter(input.adapterType);
    if (input.config !== undefined) assertConfigHasNoRawSecrets(input.config);

    const environment = await prisma.$transaction(async (tx: TxClient) => {
      await this.lockOrganizationDefaults(tx, organizationId);

      const existing = await tx.agentEnvironment.findFirstOrThrow({
        where: { id, organizationId },
      });
      const enabled = input.enabled ?? existing.enabled;
      const isDefault = enabled && (input.isDefault ?? existing.isDefault);

      if (isDefault) {
        await tx.agentEnvironment.updateMany({
          where: { organizationId, enabled: true, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.agentEnvironment.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: normalizeName(input.name) } : {}),
          ...(input.adapterType !== undefined ? { adapterType: input.adapterType } : {}),
          ...(input.config !== undefined ? { config: input.config } : {}),
          ...(input.enabled !== undefined ? { enabled } : {}),
          isDefault,
        },
      });
    });

    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: organizationId,
      eventType: "agent_environment_updated",
      payload: { agentEnvironment: environmentPayload(environment) },
      actorType,
      actorId,
    });

    return environment;
  }

  async delete(id: string, organizationId: string, actorType: ActorType, actorId: string) {
    await prisma.agentEnvironment.findFirstOrThrow({
      where: { id, organizationId },
      select: { id: true },
    });
    const environment = await prisma.agentEnvironment.delete({
      where: { id },
    });

    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: organizationId,
      eventType: "agent_environment_deleted",
      payload: { agentEnvironment: environmentPayload(environment) },
      actorType,
      actorId,
    });

    return environment;
  }

  private async lockOrganizationDefaults(tx: TxClient, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
  }
}

export const agentEnvironmentService = new AgentEnvironmentService();
