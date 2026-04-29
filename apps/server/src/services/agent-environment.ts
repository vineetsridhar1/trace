import type { ActorType } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";

const ADAPTER_TYPES = new Set(["local", "provisioned"]);
const AUTH_CONFIG_KEYS = new Set(["type", "secretId"]);
const RAW_SECRET_KEY_PATTERNS = ["apikey", "authorization", "password", "secret", "token"];

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

function assertConfigStoresOnlySecretReferences(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(assertConfigStoresOnlySecretReferences);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
    if (key === "auth") {
      assertAuthConfigStoresOnlySecretReferences(child);
    } else if (
      normalizedKey !== "secretid" &&
      RAW_SECRET_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern)) &&
      typeof child === "string" &&
      child.trim()
    ) {
      throw new Error("Agent environment config cannot store raw secrets; reference an OrgSecret");
    }
    assertConfigStoresOnlySecretReferences(child);
  }
}

function assertAuthConfigStoresOnlySecretReferences(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Agent environment auth config must reference an OrgSecret");
  }

  for (const key of Object.keys(value)) {
    if (!AUTH_CONFIG_KEYS.has(key)) {
      throw new Error("Agent environment auth config can only include type and secretId");
    }
  }

  const auth = value as Record<string, unknown>;
  if (auth.secretId !== undefined && typeof auth.secretId !== "string") {
    throw new Error("Agent environment auth secretId must be a string");
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
  async list(organizationId: string, actorType: ActorType, actorId: string) {
    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      return tx.agentEnvironment.findMany({
        where: { organizationId },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      });
    });
  }

  async create(input: AgentEnvironmentInput, actorType: ActorType, actorId: string) {
    const name = normalizeName(input.name);
    assertSupportedAdapter(input.adapterType);
    assertConfigStoresOnlySecretReferences(input.config);

    const environment = await prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAccess(tx, input.organizationId, actorType, actorId);
      await this.lockOrganizationDefaults(tx, input.organizationId);
      const enabled = input.enabled ?? true;
      const isDefault = enabled && input.isDefault === true;
      if (isDefault) {
        await tx.agentEnvironment.updateMany({
          where: { organizationId: input.organizationId, enabled: true, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.agentEnvironment.create({
        data: {
          organizationId: input.organizationId,
          name,
          adapterType: input.adapterType,
          config: input.config ?? {},
          enabled,
          isDefault,
        },
      });

      await eventService.create(
        {
          organizationId: created.organizationId,
          scopeType: "system",
          scopeId: created.organizationId,
          eventType: "agent_environment_created",
          payload: { agentEnvironment: environmentPayload(created) },
          actorType,
          actorId,
        },
        tx,
      );

      return created;
    });

    return environment;
  }

  async update(
    id: string,
    input: AgentEnvironmentUpdateInput,
    actorType: ActorType,
    actorId: string,
  ) {
    if (input.name !== undefined) normalizeName(input.name);
    if (input.adapterType !== undefined) assertSupportedAdapter(input.adapterType);
    if (input.config !== undefined) assertConfigStoresOnlySecretReferences(input.config);

    const environment = await prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.agentEnvironment.findFirstOrThrow({
        where: { id },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);
      await this.lockOrganizationDefaults(tx, existing.organizationId);

      const enabled = input.enabled ?? existing.enabled;
      const isDefault = enabled && (input.isDefault ?? existing.isDefault);

      if (isDefault) {
        await tx.agentEnvironment.updateMany({
          where: {
            organizationId: existing.organizationId,
            enabled: true,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      const updated = await tx.agentEnvironment.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: normalizeName(input.name) } : {}),
          ...(input.adapterType !== undefined ? { adapterType: input.adapterType } : {}),
          ...(input.config !== undefined ? { config: input.config } : {}),
          ...(input.enabled !== undefined ? { enabled } : {}),
          isDefault,
        },
      });

      await eventService.create(
        {
          organizationId: existing.organizationId,
          scopeType: "system",
          scopeId: existing.organizationId,
          eventType: "agent_environment_updated",
          payload: { agentEnvironment: environmentPayload(updated) },
          actorType,
          actorId,
        },
        tx,
      );

      return updated;
    });

    return environment;
  }

  async delete(id: string, actorType: ActorType, actorId: string) {
    const environment = await prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.agentEnvironment.findFirstOrThrow({
        where: { id },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);

      const deleted = await tx.agentEnvironment.delete({
        where: { id },
      });

      await eventService.create(
        {
          organizationId: existing.organizationId,
          scopeType: "system",
          scopeId: existing.organizationId,
          eventType: "agent_environment_deleted",
          payload: { agentEnvironment: environmentPayload(deleted) },
          actorType,
          actorId,
        },
        tx,
      );

      return deleted;
    });

    return environment;
  }

  async test(id: string, actorType: ActorType, actorId: string) {
    const environment = await prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.agentEnvironment.findFirstOrThrow({
        where: { id },
        select: { adapterType: true, enabled: true, organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);
      return existing;
    });

    if (!environment.enabled) {
      return {
        ok: false,
        message: "Agent environment is disabled",
      };
    }

    return {
      ok: false,
      message: `${environment.adapterType} environment testing requires runtime adapter validation`,
    };
  }

  private async lockOrganizationDefaults(tx: TxClient, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
  }
}

export const agentEnvironmentService = new AgentEnvironmentService();
