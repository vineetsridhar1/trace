import type { ActorType, CodingTool } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";

const ADAPTER_TYPES = new Set(["local", "provisioned"]);
const CODING_TOOLS = new Set(["claude_code", "codex", "custom"]);
const AUTH_CONFIG_KEYS = new Set(["type", "secretId"]);
const RAW_SECRET_KEY_PATTERNS = ["apikey", "authorization", "password", "secret", "token"];

type TxClient = Prisma.TransactionClient;
type AgentEnvironmentAdapterType = "local" | "provisioned";

type AgentEnvironmentInput = {
  organizationId: string;
  name: string;
  adapterType: string;
  config?: Prisma.InputJsonValue;
  enabled?: boolean;
  isDefault?: boolean;
};

type AgentEnvironmentUpdateInput = Partial<Omit<AgentEnvironmentInput, "organizationId">>;

type AgentEnvironmentRecord = {
  id: string;
  organizationId: string;
  name: string;
  adapterType: string;
  config: Prisma.JsonValue;
  enabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ResolvedSessionEnvironment = AgentEnvironmentRecord & {
  adapterType: AgentEnvironmentAdapterType;
};

type RuntimeEnvironmentAdapter = {
  type: AgentEnvironmentAdapterType;
  validateConfig(config: Record<string, unknown>): Promise<void>;
  testConfig(input: {
    organizationId: string;
    config: Record<string, unknown>;
  }): Promise<{ ok: boolean; message?: string | null }>;
};

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("Agent environment name is required");
  return normalized;
}

function assertSupportedAdapter(
  adapterType: string,
): asserts adapterType is AgentEnvironmentAdapterType {
  if (!ADAPTER_TYPES.has(adapterType)) {
    throw new Error("Agent environment adapterType must be local or provisioned");
  }
}

function asConfigRecord(
  config: Prisma.InputJsonValue | Prisma.JsonValue | undefined,
): Record<string, unknown> {
  if (config === undefined) return {};
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Agent environment config must be an object");
  }
  return config as Record<string, unknown>;
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

function getCapabilities(config: Record<string, unknown>): Record<string, unknown> | null {
  const capabilities = config.capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return null;
  return capabilities as Record<string, unknown>;
}

function assertCompatibilityConstraints(config: Record<string, unknown>): void {
  const capabilities = getCapabilities(config);
  const supportedTools = capabilities?.supportedTools;
  if (supportedTools !== undefined) {
    if (!Array.isArray(supportedTools)) {
      throw new Error("Agent environment capabilities.supportedTools must be an array");
    }
    for (const tool of supportedTools) {
      if (typeof tool !== "string" || !CODING_TOOLS.has(tool)) {
        throw new Error(
          "Agent environment capabilities.supportedTools contains an unsupported tool",
        );
      }
    }
  }

  const startupTimeoutSeconds = config.startupTimeoutSeconds;
  if (
    startupTimeoutSeconds !== undefined &&
    (typeof startupTimeoutSeconds !== "number" ||
      !Number.isInteger(startupTimeoutSeconds) ||
      startupTimeoutSeconds < 1)
  ) {
    throw new Error("Agent environment startupTimeoutSeconds must be a positive integer");
  }
}

function assertSupportsTool(environment: AgentEnvironmentRecord, tool: CodingTool): void {
  const capabilities = getCapabilities(asConfigRecord(environment.config));
  const supportedTools = capabilities?.supportedTools;
  if (!Array.isArray(supportedTools)) return;
  if (!supportedTools.includes(tool)) {
    throw new Error("Agent environment does not support the requested coding tool");
  }
}

function environmentPayload(environment: AgentEnvironmentRecord): Prisma.InputJsonObject {
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

const runtimeEnvironmentAdapters: Record<AgentEnvironmentAdapterType, RuntimeEnvironmentAdapter> = {
  local: {
    type: "local",
    async validateConfig(config) {
      assertCompatibilityConstraints(config);
    },
    async testConfig() {
      return { ok: true, message: "Local environment config is valid" };
    },
  },
  provisioned: {
    type: "provisioned",
    async validateConfig(config) {
      assertCompatibilityConstraints(config);
      for (const key of ["startUrl", "stopUrl", "statusUrl"]) {
        const value = config[key];
        if (typeof value !== "string" || !value.trim()) {
          throw new Error(`Provisioned agent environment config requires ${key}`);
        }
        try {
          new URL(value);
        } catch {
          throw new Error(`Provisioned agent environment ${key} must be a valid URL`);
        }
      }
    },
    async testConfig() {
      return {
        ok: false,
        message: "Provisioned environment testing requires runtime adapter connectivity",
      };
    },
  },
};

function getRuntimeEnvironmentAdapter(adapterType: string): RuntimeEnvironmentAdapter {
  assertSupportedAdapter(adapterType);
  return runtimeEnvironmentAdapters[adapterType];
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
    const config = asConfigRecord(input.config);
    assertConfigStoresOnlySecretReferences(input.config);
    await getRuntimeEnvironmentAdapter(input.adapterType).validateConfig(config);

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
          config: config as Prisma.InputJsonObject,
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
      const adapterType = input.adapterType ?? existing.adapterType;
      assertSupportedAdapter(adapterType);
      const config =
        input.config === undefined ? asConfigRecord(existing.config) : asConfigRecord(input.config);
      await getRuntimeEnvironmentAdapter(adapterType).validateConfig(config);
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
          ...(input.adapterType !== undefined ? { adapterType } : {}),
          ...(input.config !== undefined ? { config: config as Prisma.InputJsonObject } : {}),
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
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);

      const referencingSessions = await tx.session.count({
        where: { connection: { path: ["environmentId"], equals: id } },
      });
      const deleted =
        referencingSessions > 0
          ? await tx.agentEnvironment.update({
              where: { id },
              data: { enabled: false, isDefault: false },
            })
          : await tx.agentEnvironment.delete({
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

    return getRuntimeEnvironmentAdapter(environment.adapterType).testConfig({
      organizationId: environment.organizationId,
      config: asConfigRecord(environment.config),
    });
  }

  async setDefault(id: string, actorType: ActorType, actorId: string) {
    return this.update(id, { isDefault: true, enabled: true }, actorType, actorId);
  }

  async resolveDefault(organizationId: string, actorType: ActorType, actorId: string) {
    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      return tx.agentEnvironment.findFirstOrThrow({
        where: { organizationId, enabled: true, isDefault: true },
      });
    });
  }

  async resolveForSessionRequest(params: {
    organizationId: string;
    environmentId?: string | null;
    tool: CodingTool;
    actorType: ActorType;
    actorId: string;
  }): Promise<ResolvedSessionEnvironment | null> {
    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAccess(tx, params.organizationId, params.actorType, params.actorId);
      const environment = params.environmentId
        ? await tx.agentEnvironment.findFirstOrThrow({
            where: { id: params.environmentId, organizationId: params.organizationId },
          })
        : await tx.agentEnvironment.findFirst({
            where: { organizationId: params.organizationId, enabled: true, isDefault: true },
          });

      if (!environment) return null;
      if (!environment.enabled) {
        throw new Error("Agent environment is disabled");
      }
      assertSupportedAdapter(environment.adapterType);
      await getRuntimeEnvironmentAdapter(environment.adapterType).validateConfig(
        asConfigRecord(environment.config),
      );
      assertSupportsTool(environment, params.tool);
      return environment as ResolvedSessionEnvironment;
    });
  }

  private async lockOrganizationDefaults(tx: TxClient, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
  }
}

export const agentEnvironmentService = new AgentEnvironmentService();
