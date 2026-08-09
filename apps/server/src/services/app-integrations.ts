import type {
  IntegrationConnectionKind,
  IntegrationExecutionIdentity,
  UpsertAppIntegrationBindingInput,
} from "@trace/gql";
import {
  supportedIntegration,
  supportedIntegrations,
} from "../config/supported-integrations.js";
import { prisma } from "../lib/db.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";
import { nangoConnectionProvider, type NangoProxyResponse } from "./nango-connection-provider.js";

const PROVIDER_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const SNOWFLAKE_STATEMENTS_PATH = "/api/v2/statements";
const MAX_SNOWFLAKE_QUERY_LENGTH = 100_000;
const MAX_SNOWFLAKE_PARAMETERS = 100;
const SNOWFLAKE_WRITE_KEYWORDS = new Set([
  "ALTER",
  "BEGIN",
  "CALL",
  "COMMIT",
  "COPY",
  "CREATE",
  "DELETE",
  "DROP",
  "EXECUTE",
  "GET",
  "GRANT",
  "INSERT",
  "MERGE",
  "PUT",
  "REMOVE",
  "REVOKE",
  "ROLLBACK",
  "SET",
  "TRUNCATE",
  "UNSET",
  "UPDATE",
  "USE",
]);

export type SnowflakeQueryInput = {
  sql: string;
  parameters?: Array<string | number | boolean>;
  database?: string;
  schema?: string;
  warehouse?: string;
  timeoutSeconds?: number;
};

function snowflakeSqlTokens(sql: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index]!;
    const next = sql[index + 1];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end === -1) throw new ValidationError("Snowflake query has an unterminated comment");
      index = end + 2;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] !== quote) {
          index += 1;
          continue;
        }
        if (sql[index + 1] === quote) {
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) throw new ValidationError("Snowflake query has an unterminated string");
      continue;
    }
    if (char === "$") {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        if (end === -1) throw new ValidationError("Snowflake query has an unterminated string");
        index = end + delimiter.length;
        continue;
      }
    }
    if (char === ";") {
      throw new ValidationError("Snowflake queries must contain exactly one statement");
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
      if (!match) throw new ValidationError("Snowflake query is invalid");
      tokens.push(match.toUpperCase());
      index += match.length;
      continue;
    }
    index += 1;
  }
  return tokens;
}

export function assertSnowflakeReadOnlyQuery(sql: string): void {
  const normalized = sql.trim();
  if (!normalized) throw new ValidationError("Snowflake query is required");
  if (normalized.length > MAX_SNOWFLAKE_QUERY_LENGTH) {
    throw new ValidationError("Snowflake query is too long");
  }
  const tokens = snowflakeSqlTokens(normalized);
  if (tokens[0] !== "SELECT" && tokens[0] !== "WITH") {
    throw new ValidationError("Snowflake integrations only allow SELECT queries");
  }
  if (!tokens.includes("SELECT")) {
    throw new ValidationError("Snowflake integrations only allow SELECT queries");
  }
  const forbidden = tokens.find(
    (token) => SNOWFLAKE_WRITE_KEYWORDS.has(token) || token.startsWith("SYSTEM$"),
  );
  if (forbidden) {
    throw new ValidationError(`Snowflake query contains a forbidden operation: ${forbidden}`);
  }
}

function snowflakeBindings(parameters: Array<string | number | boolean>) {
  if (parameters.length > MAX_SNOWFLAKE_PARAMETERS) {
    throw new ValidationError("Snowflake query has too many parameters");
  }
  return Object.fromEntries(
    parameters.map((value, index) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new ValidationError("Snowflake query parameters must be finite values");
      }
      const type =
        typeof value === "boolean"
          ? "BOOLEAN"
          : typeof value === "number" && Number.isInteger(value)
            ? "FIXED"
            : typeof value === "number"
              ? "REAL"
              : "TEXT";
      return [String(index + 1), { type, value: String(value) }];
    }),
  );
}

function optionalSnowflakeContext(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, label, 255);
}

function requiredText(value: string, label: string, maxLength = 120): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${label} is required`);
  if (normalized.length > maxLength) throw new ValidationError(`${label} is too long`);
  return normalized;
}

function providerKey(value: string): string {
  const normalized = requiredText(value, "Provider config key", 128);
  if (!PROVIDER_KEY_PATTERN.test(normalized)) {
    throw new ValidationError("Provider config key contains unsupported characters");
  }
  return normalized;
}

function normalizeMethod(value: string): string {
  const method = value.trim().toUpperCase();
  if (!ALLOWED_METHODS.has(method)) throw new ValidationError(`Unsupported method: ${value}`);
  return method;
}

export function normalizeIntegrationPath(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new ValidationError("Integration path is not valid URL encoding");
  }
  if (!decoded.startsWith("/") || decoded.includes("\\")) {
    throw new ValidationError("Integration path must be an absolute provider path");
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new ValidationError("Integration path cannot contain traversal segments");
  }
  return decoded.replace(/\/{2,}/g, "/");
}

function normalizePathPrefix(value: string): string {
  const prefix = normalizeIntegrationPath(requiredText(value, "Allowed path prefix", 512));
  if (prefix.includes("?"))
    throw new ValidationError("Allowed path prefixes cannot include a query");
  return prefix.length > 1 ? prefix.replace(/\/$/, "") : prefix;
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return prefix === "/" || path === prefix || path.startsWith(`${prefix}/`);
}

function publicConnection(connection: {
  id: string;
  ownerUserId: string;
  provider: string;
  providerConfigKey: string;
  displayName: string;
  kind: string;
  status: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: connection.id,
    ownerUserId: connection.ownerUserId,
    provider: connection.provider,
    providerConfigKey: connection.providerConfigKey,
    displayName: connection.displayName,
    kind: connection.kind,
    status: connection.status,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function publicBinding(binding: {
  id: string;
  sessionGroupId: string;
  label: string;
  provider: string;
  providerConfigKey: string;
  executionIdentity: string;
  sharedConnectionId: string | null;
  allowedMethods: string[];
  allowedPathPrefixes: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: binding.id,
    sessionGroupId: binding.sessionGroupId,
    label: binding.label,
    provider: binding.provider,
    providerConfigKey: binding.providerConfigKey,
    executionIdentity: binding.executionIdentity,
    sharedConnectionId: binding.sharedConnectionId,
    allowedMethods: binding.allowedMethods,
    allowedPathPrefixes: binding.allowedPathPrefixes,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
  };
}

type Role = "admin" | "member" | "observer" | null | undefined;

export class AppIntegrationService {
  nangoConfigured(): boolean {
    return nangoConnectionProvider.isConfigured();
  }

  listSupportedIntegrations() {
    return supportedIntegrations();
  }

  async listConnections(organizationId: string, userId: string, role: Role) {
    return prisma.integrationConnection.findMany({
      where: {
        organizationId,
        status: { not: "revoked" },
        ...(role === "admin" ? {} : { ownerUserId: userId }),
      },
      orderBy: [{ provider: "asc" }, { displayName: "asc" }],
    });
  }

  async createConnectSession(
    organizationId: string,
    userId: string,
    role: Role,
    input: {
      integrationId?: string | null;
      providerConfigKey?: string | null;
      displayName?: string | null;
      kind?: IntegrationConnectionKind | null;
    },
  ) {
    const kind = input.kind ?? "personal";
    if (kind === "service" && role !== "admin") {
      throw new AuthorizationError("Only organization admins can create service connections");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) throw new NotFoundError("User", userId);
    const integration = input.integrationId ? supportedIntegration(input.integrationId) : undefined;
    if (input.integrationId && !integration) {
      throw new ValidationError("This integration is not supported");
    }
    const providerConfigKey = integration?.providerConfigKey ?? input.providerConfigKey;
    if (!providerConfigKey) throw new ValidationError("An integration is required");
    return nangoConnectionProvider.createConnectSession({
      organizationId,
      userId,
      userEmail: user.email,
      userName: user.name,
      providerConfigKey: providerKey(providerConfigKey),
      displayName:
        input.displayName?.trim() ||
        `${integration?.name ?? "Integration"} ${kind === "service" ? "service account" : "account"}`,
      kind,
    });
  }

  async deleteConnection(organizationId: string, userId: string, role: Role, id: string) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id, organizationId, status: { not: "revoked" } },
      include: { _count: { select: { sharedBindings: true } } },
    });
    if (!connection) throw new NotFoundError("Integration connection", id);
    if (connection.ownerUserId !== userId && role !== "admin") {
      throw new AuthorizationError("Only the connection owner or an org admin can disconnect it");
    }
    if (connection._count.sharedBindings > 0) {
      throw new ValidationError("Remove this connection from applications before disconnecting it");
    }
    await nangoConnectionProvider.deleteConnection(
      connection.nangoConnectionId,
      connection.providerConfigKey,
    );
    await prisma.$transaction(async (tx) => {
      await tx.integrationConnection.update({
        where: { id },
        data: { status: "revoked", lastError: null },
      });
      await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: organizationId,
          eventType: "integration_connection_deleted",
          payload: { connectionId: id, provider: connection.provider },
          actorType: "user",
          actorId: userId,
        },
        tx,
      );
    });
    return true;
  }

  async listBindings(sessionGroupId: string, organizationId: string, userId: string) {
    await this.assertCanViewApp(sessionGroupId, organizationId, userId);
    return prisma.appIntegrationBinding.findMany({
      where: { sessionGroupId, organizationId },
      include: { sharedConnection: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async upsertBinding(
    organizationId: string,
    userId: string,
    role: Role,
    input: UpsertAppIntegrationBindingInput,
  ) {
    await this.assertCanManageApp(input.sessionGroupId, organizationId, userId, role);
    const identity = input.executionIdentity;
    const integration = input.integrationId ? supportedIntegration(input.integrationId) : undefined;
    if (input.integrationId && !integration) {
      throw new ValidationError("This integration is not supported");
    }
    const configuredProviderKey = integration?.providerConfigKey ?? input.providerConfigKey;
    if (!configuredProviderKey) throw new ValidationError("An integration is required");
    const normalizedProviderKey = providerKey(configuredProviderKey);
    const sharedConnectionId = input.sharedConnectionId ?? null;
    if (identity === "viewer" && sharedConnectionId) {
      throw new ValidationError("Viewer connections cannot specify a shared connection");
    }
    if (identity !== "viewer" && !sharedConnectionId) {
      throw new ValidationError("Shared and service bindings require a connection");
    }
    if (sharedConnectionId) {
      const connection = await prisma.integrationConnection.findFirst({
        where: { id: sharedConnectionId, organizationId, status: "active" },
      });
      if (!connection) throw new ValidationError("Selected connection is unavailable");
      if (connection.providerConfigKey !== normalizedProviderKey) {
        throw new ValidationError("Connection does not match the binding provider");
      }
      if (identity === "service" && connection.kind !== "service") {
        throw new ValidationError("Service bindings require a service connection");
      }
      if (identity === "shared" && connection.kind !== "personal") {
        throw new ValidationError("Shared bindings require a personal connection");
      }
      if (connection.ownerUserId !== userId && role !== "admin") {
        throw new AuthorizationError("Only an org admin can share another user's connection");
      }
    }
    const capabilityIds = input.capabilityIds ?? [];
    const selectedCapabilities = integration
      ? capabilityIds.map((id) => {
          const capability = integration.capabilities.find((candidate) => candidate.id === id);
          if (!capability) {
            throw new ValidationError(`${integration.name} does not support capability ${id}`);
          }
          return capability;
        })
      : [];
    if (integration && selectedCapabilities.length === 0) {
      throw new ValidationError("Choose at least one integration capability");
    }
    const allowedMethods = integration
      ? selectedCapabilities.flatMap((capability) => capability.allowedMethods)
      : (input.allowedMethods ?? []);
    const allowedPathPrefixes = integration
      ? selectedCapabilities.flatMap((capability) => capability.allowedPathPrefixes)
      : (input.allowedPathPrefixes ?? []);
    const methods = [...new Set(allowedMethods.map(normalizeMethod))];
    const paths = [...new Set(allowedPathPrefixes.map(normalizePathPrefix))];
    if (methods.length === 0) throw new ValidationError("At least one HTTP method is required");
    if (paths.length === 0) throw new ValidationError("At least one provider path is required");
    if (methods.length > 6 || paths.length > 20) throw new ValidationError("Too many permissions");
    const data = {
      organizationId,
      sessionGroupId: input.sessionGroupId,
      label: input.label?.trim() || integration?.name || "Integration",
      provider: integration?.provider ?? requiredText(input.provider ?? "", "Provider", 128),
      providerConfigKey: normalizedProviderKey,
      executionIdentity: identity,
      sharedConnectionId,
      allowedMethods: methods,
      allowedPathPrefixes: paths,
    };
    const binding = await prisma.$transaction(async (tx) => {
      const saved = input.id
        ? await tx.appIntegrationBinding.update({
            where: { id: input.id, organizationId, sessionGroupId: input.sessionGroupId },
            data,
            include: { sharedConnection: true },
          })
        : await tx.appIntegrationBinding.create({
            data: { ...data, createdByUserId: userId },
            include: { sharedConnection: true },
          });
      await eventService.create(
        {
          organizationId,
          scopeType: "session",
          scopeId: input.sessionGroupId,
          eventType: "app_integration_binding_updated",
          payload: { binding: publicBinding(saved) },
          actorType: "user",
          actorId: userId,
        },
        tx,
      );
      return saved;
    });
    return binding;
  }

  async deleteBinding(organizationId: string, userId: string, role: Role, id: string) {
    const binding = await prisma.appIntegrationBinding.findFirst({ where: { id, organizationId } });
    if (!binding) throw new NotFoundError("Application integration binding", id);
    await this.assertCanManageApp(binding.sessionGroupId, organizationId, userId, role);
    await prisma.$transaction(async (tx) => {
      await tx.appIntegrationBinding.delete({ where: { id } });
      await eventService.create(
        {
          organizationId,
          scopeType: "session",
          scopeId: binding.sessionGroupId,
          eventType: "app_integration_binding_updated",
          payload: { bindingId: id, deleted: true },
          actorType: "user",
          actorId: userId,
        },
        tx,
      );
    });
    return true;
  }

  async execute(input: {
    endpoint: { organizationId: string; sessionGroupId: string };
    userId: string;
    bindingId: string;
    method: string;
    path: string;
    query: string | null;
    contentType: string | null;
    body: Buffer;
  }): Promise<NangoProxyResponse> {
    await this.assertCanViewApp(
      input.endpoint.sessionGroupId,
      input.endpoint.organizationId,
      input.userId,
    );
    const integration = supportedIntegration(input.bindingId);
    const binding = await prisma.appIntegrationBinding.findFirst({
      where: {
        ...(integration
          ? { providerConfigKey: integration.providerConfigKey }
          : { id: input.bindingId }),
        organizationId: input.endpoint.organizationId,
        sessionGroupId: input.endpoint.sessionGroupId,
      },
    });
    if (!binding) throw new NotFoundError("Application integration binding", input.bindingId);
    const method = normalizeMethod(input.method);
    const path = normalizeIntegrationPath(input.path);
    if (!binding.allowedMethods.includes(method)) {
      throw new AuthorizationError("This application is not allowed to use that HTTP method");
    }
    if (!binding.allowedPathPrefixes.some((prefix) => pathMatchesPrefix(path, prefix))) {
      throw new AuthorizationError("This application is not allowed to access that provider path");
    }
    if (method === "POST" && pathMatchesPrefix(path, SNOWFLAKE_STATEMENTS_PATH)) {
      throw new AuthorizationError(
        "Snowflake queries must use the server-side Trace integration helper",
      );
    }
    const connection = await this.resolveExecutionConnection(binding, input.userId);
    const response = await nangoConnectionProvider.proxy({
      connectionId: connection.nangoConnectionId,
      providerConfigKey: binding.providerConfigKey,
      method,
      path,
      query: input.query,
      contentType: input.contentType,
      body: input.body,
    });
    await eventService.create({
      organizationId: binding.organizationId,
      scopeType: "session",
      scopeId: binding.sessionGroupId,
      eventType: "app_integration_request_executed",
      payload: {
        bindingId: binding.id,
        connectionId: connection.id,
        executionIdentity: binding.executionIdentity,
        method,
        path,
        status: response.status,
      },
      actorType: "user",
      actorId: input.userId,
    });
    return response;
  }

  async executeSnowflakeQuery(input: {
    endpoint: { organizationId: string; sessionGroupId: string };
    userId: string;
    bindingId: string;
    query: SnowflakeQueryInput;
  }): Promise<NangoProxyResponse> {
    await this.assertCanViewApp(
      input.endpoint.sessionGroupId,
      input.endpoint.organizationId,
      input.userId,
    );
    const integration = supportedIntegration(input.bindingId);
    const binding = await prisma.appIntegrationBinding.findFirst({
      where: {
        ...(integration
          ? { providerConfigKey: integration.providerConfigKey }
          : { id: input.bindingId }),
        organizationId: input.endpoint.organizationId,
        sessionGroupId: input.endpoint.sessionGroupId,
      },
    });
    if (!binding) throw new NotFoundError("Application integration binding", input.bindingId);
    if (binding.provider.trim().toLowerCase() !== "snowflake") {
      throw new ValidationError("This binding is not a Snowflake integration");
    }
    if (
      !binding.allowedMethods.includes("POST") ||
      !binding.allowedPathPrefixes.some((prefix) =>
        pathMatchesPrefix(SNOWFLAKE_STATEMENTS_PATH, prefix),
      )
    ) {
      throw new AuthorizationError("This application is not allowed to query Snowflake");
    }
    assertSnowflakeReadOnlyQuery(input.query.sql);
    const parameters = input.query.parameters ?? [];
    const timeoutSeconds = input.query.timeoutSeconds ?? 30;
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 45) {
      throw new ValidationError("Snowflake query timeout must be between 1 and 45 seconds");
    }
    const connection = await this.resolveExecutionConnection(binding, input.userId);
    const requestBody = {
      statement: input.query.sql,
      timeout: timeoutSeconds,
      ...(parameters.length ? { bindings: snowflakeBindings(parameters) } : {}),
      ...(input.query.database === undefined
        ? {}
        : { database: optionalSnowflakeContext(input.query.database, "Snowflake database") }),
      ...(input.query.schema === undefined
        ? {}
        : { schema: optionalSnowflakeContext(input.query.schema, "Snowflake schema") }),
      ...(input.query.warehouse === undefined
        ? {}
        : { warehouse: optionalSnowflakeContext(input.query.warehouse, "Snowflake warehouse") }),
    };
    const response = await nangoConnectionProvider.proxy({
      connectionId: connection.nangoConnectionId,
      providerConfigKey: binding.providerConfigKey,
      method: "POST",
      path: SNOWFLAKE_STATEMENTS_PATH,
      query: null,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(requestBody)),
    });
    await eventService.create({
      organizationId: binding.organizationId,
      scopeType: "session",
      scopeId: binding.sessionGroupId,
      eventType: "app_integration_request_executed",
      payload: {
        bindingId: binding.id,
        connectionId: connection.id,
        executionIdentity: binding.executionIdentity,
        method: "POST",
        path: SNOWFLAKE_STATEMENTS_PATH,
        status: response.status,
      },
      actorType: "user",
      actorId: input.userId,
    });
    return response;
  }

  async reconcileNangoAuthWebhook(payload: unknown) {
    if (!payload || typeof payload !== "object") return;
    const value = payload as Record<string, unknown>;
    if (value.type !== "auth") return;
    const operation = value.operation;
    const success = value.success;
    const connectionId = value.connectionId;
    const providerConfigKey = value.providerConfigKey;
    const provider = value.provider;
    const tags = value.tags;
    if (
      typeof connectionId !== "string" ||
      typeof providerConfigKey !== "string" ||
      typeof provider !== "string" ||
      !tags ||
      typeof tags !== "object"
    ) {
      throw new ValidationError("Invalid Nango auth webhook");
    }
    const tagMap = tags as Record<string, unknown>;
    const organizationId = tagMap.organization_id;
    const ownerUserId = tagMap.end_user_id;
    if (typeof organizationId !== "string" || typeof ownerUserId !== "string") {
      throw new ValidationError("Nango webhook is missing Trace ownership tags");
    }
    const membership = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId: ownerUserId, organizationId } },
      select: { role: true },
    });
    if (!membership)
      throw new AuthorizationError("Nango connection owner is not in the organization");
    const kind: IntegrationConnectionKind =
      tagMap.trace_connection_kind === "service" ? "service" : "personal";
    if (kind === "service" && membership.role !== "admin") {
      throw new AuthorizationError("Service connections require an organization admin");
    }
    const error = value.error;
    const lastError =
      error && typeof error === "object" && "description" in error
        ? String((error as { description: unknown }).description)
        : null;
    if (operation === "refresh" && success === false) {
      await prisma.integrationConnection.updateMany({
        where: { nangoConnectionId: connectionId, providerConfigKey },
        data: { status: "error", lastError: lastError ?? "Credential refresh failed" },
      });
      return;
    }
    if (operation !== "creation" && operation !== "override") return;
    const displayName =
      typeof tagMap.trace_display_name === "string"
        ? requiredText(tagMap.trace_display_name, "Connection name")
        : provider;
    const existing = await prisma.integrationConnection.findUnique({
      where: {
        providerConfigKey_nangoConnectionId: { providerConfigKey, nangoConnectionId: connectionId },
      },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      const connection = await tx.integrationConnection.upsert({
        where: {
          providerConfigKey_nangoConnectionId: {
            providerConfigKey,
            nangoConnectionId: connectionId,
          },
        },
        create: {
          organizationId,
          ownerUserId,
          createdByUserId: ownerUserId,
          provider,
          providerConfigKey,
          nangoConnectionId: connectionId,
          displayName,
          kind,
          status: success === false ? "error" : "active",
          lastError,
        },
        update: {
          organizationId,
          ownerUserId,
          provider,
          displayName,
          kind,
          status: success === false ? "error" : "active",
          lastError,
        },
      });
      await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: organizationId,
          eventType: existing ? "integration_connection_updated" : "integration_connection_created",
          payload: { connection: publicConnection(connection) },
          actorType: "user",
          actorId: ownerUserId,
        },
        tx,
      );
    });
  }

  private async resolveExecutionConnection(
    binding: {
      providerConfigKey: string;
      executionIdentity: IntegrationExecutionIdentity;
      sharedConnectionId: string | null;
      organizationId: string;
    },
    userId: string,
  ) {
    const connection = await prisma.integrationConnection.findFirst({
      where:
        binding.executionIdentity === "viewer"
          ? {
              organizationId: binding.organizationId,
              ownerUserId: userId,
              providerConfigKey: binding.providerConfigKey,
              kind: "personal",
              status: "active",
            }
          : {
              id: binding.sharedConnectionId ?? "",
              organizationId: binding.organizationId,
              providerConfigKey: binding.providerConfigKey,
              kind: binding.executionIdentity === "service" ? "service" : "personal",
              status: "active",
            },
      orderBy: { updatedAt: "desc" },
    });
    if (!connection) {
      throw new AuthorizationError(
        binding.executionIdentity === "viewer"
          ? "Connect your account to use this application"
          : "The application's shared connection is unavailable",
      );
    }
    return connection;
  }

  private async assertCanViewApp(sessionGroupId: string, organizationId: string, userId: string) {
    const membership = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { userId: true },
    });
    if (!membership) throw new AuthorizationError("Not a member of this organization");
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId, kind: "app" },
      select: { ownerUserId: true, visibility: true },
    });
    if (!group) throw new NotFoundError("Application", sessionGroupId);
    if (!canViewSessionGroup(group, userId))
      throw new AuthorizationError("Not authorized for this application");
  }

  private async assertCanManageApp(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
    role: Role,
  ) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId, kind: "app" },
      select: { ownerUserId: true },
    });
    if (!group) throw new NotFoundError("Application", sessionGroupId);
    if (group.ownerUserId !== userId && role !== "admin") {
      throw new AuthorizationError(
        "Only the application owner or an org admin can configure data access",
      );
    }
  }
}

export const appIntegrationService = new AppIntegrationService();
