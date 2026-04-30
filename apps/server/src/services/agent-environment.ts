import type { ActorType, CodingTool } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { runtimeAdapterRegistry } from "../lib/runtime-adapters.js";
import type { RuntimeAdapterType } from "../lib/runtime-adapter-registry.js";

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

type EnsureLocalBridgeEnvironmentInput = {
  organizationId: string;
  runtimeInstanceId: string;
  runtimeLabel: string;
  supportedTools: CodingTool[];
};

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
  adapterType: RuntimeAdapterType;
};

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("Agent environment name is required");
  return normalized;
}

function assertSupportedAdapter(adapterType: string): asserts adapterType is RuntimeAdapterType {
  runtimeAdapterRegistry.get(adapterType);
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
    orgId: environment.organizationId,
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

function localBridgeEnvironmentConfig(input: {
  existingConfig?: Prisma.JsonValue;
  runtimeInstanceId: string;
  supportedTools: CodingTool[];
}): Prisma.InputJsonObject {
  const existingConfig = asConfigRecord(input.existingConfig);
  const configWithoutRuntimeSelection = Object.fromEntries(
    Object.entries(existingConfig).filter(([key]) => key !== "runtimeSelection"),
  );
  const existingCapabilities = getCapabilities(existingConfig) ?? {};
  return {
    ...configWithoutRuntimeSelection,
    runtimeInstanceId: input.runtimeInstanceId,
    capabilities: {
      ...existingCapabilities,
      supportedTools: [...input.supportedTools],
    },
  };
}

function localRuntimeBinding(config: Prisma.InputJsonValue | Prisma.JsonValue): string | null {
  const record = asConfigRecord(config);
  const runtimeInstanceId = record.runtimeInstanceId;
  if (typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()) {
    return `runtime:${runtimeInstanceId.trim()}`;
  }
  const runtimeSelection = record.runtimeSelection;
  if (typeof runtimeSelection === "string" && runtimeSelection.trim()) {
    return `selection:${runtimeSelection.trim()}`;
  }
  return null;
}

async function affectedEnvironmentPayloads(
  tx: TxClient,
  organizationId: string,
  includeAll: boolean,
  primary: AgentEnvironmentRecord,
): Promise<Prisma.InputJsonObject[]> {
  if (!includeAll) return [environmentPayload(primary)];
  const environments = await tx.agentEnvironment.findMany({
    where: { organizationId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return environments.map(environmentPayload);
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
    if (input.adapterType === "local") {
      throw new Error("Local agent environments are created automatically by connected bridges");
    }
    const config = asConfigRecord(input.config);
    assertConfigStoresOnlySecretReferences(input.config);
    await runtimeAdapterRegistry.get(input.adapterType).validateConfig(config);

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

      const payloads = await affectedEnvironmentPayloads(
        tx,
        created.organizationId,
        isDefault,
        created,
      );

      await eventService.create(
        {
          organizationId: created.organizationId,
          scopeType: "system",
          scopeId: created.organizationId,
          eventType: "agent_environment_created",
          payload: { agentEnvironment: environmentPayload(created), agentEnvironments: payloads },
          actorType,
          actorId,
        },
        tx,
      );

      return created;
    });

    return environment;
  }

  async ensureLocalBridgeEnvironment(
    input: EnsureLocalBridgeEnvironmentInput,
    actorType: ActorType,
    actorId: string,
  ) {
    const name = normalizeName(input.runtimeLabel);
    const config = localBridgeEnvironmentConfig({
      runtimeInstanceId: input.runtimeInstanceId,
      supportedTools: input.supportedTools,
    });
    await runtimeAdapterRegistry.get("local").validateConfig(config);

    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAccess(tx, input.organizationId, actorType, actorId);
      await this.lockOrganizationDefaults(tx, input.organizationId);

      const existing = await tx.agentEnvironment.findFirst({
        where: {
          organizationId: input.organizationId,
          adapterType: "local",
          config: { path: ["runtimeInstanceId"], equals: input.runtimeInstanceId },
        },
      });
      const existingDefault = await tx.agentEnvironment.findFirst({
        where: { organizationId: input.organizationId, enabled: true, isDefault: true },
        select: { id: true },
      });

      if (existing) {
        const updatedConfig = localBridgeEnvironmentConfig({
          existingConfig: existing.config,
          runtimeInstanceId: input.runtimeInstanceId,
          supportedTools: input.supportedTools,
        });
        await runtimeAdapterRegistry.get("local").validateConfig(updatedConfig);
        const shouldBecomeDefault = existing.enabled && !existingDefault;
        const configChanged = JSON.stringify(existing.config) !== JSON.stringify(updatedConfig);
        if (!shouldBecomeDefault && !configChanged) return existing;

        const updated = await tx.agentEnvironment.update({
          where: { id: existing.id },
          data: {
            ...(configChanged ? { config: updatedConfig } : {}),
            ...(shouldBecomeDefault ? { isDefault: true } : {}),
          },
        });
        const payloads = await affectedEnvironmentPayloads(
          tx,
          input.organizationId,
          shouldBecomeDefault,
          updated,
        );

        await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "system",
            scopeId: input.organizationId,
            eventType: "agent_environment_updated",
            payload: { agentEnvironment: environmentPayload(updated), agentEnvironments: payloads },
            actorType,
            actorId,
          },
          tx,
        );

        return updated;
      }

      const isDefault = !existingDefault;
      const created = await tx.agentEnvironment.create({
        data: {
          organizationId: input.organizationId,
          name,
          adapterType: "local",
          config,
          enabled: true,
          isDefault,
        },
      });
      const payloads = await affectedEnvironmentPayloads(
        tx,
        input.organizationId,
        isDefault,
        created,
      );

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "agent_environment_created",
          payload: { agentEnvironment: environmentPayload(created), agentEnvironments: payloads },
          actorType,
          actorId,
        },
        tx,
      );

      return created;
    });
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
      if (
        (existing.adapterType === "local" && input.adapterType && input.adapterType !== "local") ||
        (existing.adapterType !== "local" && input.adapterType === "local")
      ) {
        throw new Error("Local agent environments are managed by connected bridges");
      }
      if (
        existing.adapterType === "local" &&
        input.config !== undefined &&
        localRuntimeBinding(input.config) !== localRuntimeBinding(existing.config)
      ) {
        throw new Error("Local agent environment bridge binding cannot be changed manually");
      }
      const adapterType = input.adapterType ?? existing.adapterType;
      assertSupportedAdapter(adapterType);
      const config =
        input.config === undefined ? asConfigRecord(existing.config) : asConfigRecord(input.config);
      await runtimeAdapterRegistry.get(adapterType).validateConfig(config);
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

      const payloads = await affectedEnvironmentPayloads(
        tx,
        existing.organizationId,
        isDefault,
        updated,
      );

      await eventService.create(
        {
          organizationId: existing.organizationId,
          scopeType: "system",
          scopeId: existing.organizationId,
          eventType: "agent_environment_updated",
          payload: { agentEnvironment: environmentPayload(updated), agentEnvironments: payloads },
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

    return runtimeAdapterRegistry.get(environment.adapterType).testConfig({
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
      await runtimeAdapterRegistry
        .get(environment.adapterType)
        .validateConfig(asConfigRecord(environment.config));
      assertSupportsTool(environment, params.tool);
      return environment as ResolvedSessionEnvironment;
    });
  }

  private async lockOrganizationDefaults(tx: TxClient, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
  }
}

export const agentEnvironmentService = new AgentEnvironmentService();
