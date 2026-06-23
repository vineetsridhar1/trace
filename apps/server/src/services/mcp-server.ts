import type { ActorType } from "@trace/gql";
import { Prisma, type McpConnection, type McpServer } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess, assertActorOrgAdmin } from "./actor-auth.js";
import {
  MCP_CATALOG,
  getMcpCatalogEntry,
  needsClientCredentials,
  preregisteredClient,
} from "../lib/mcp-catalog.js";
import {
  discoverOAuthMetadata,
  mcpRedirectUri,
  registerClient,
  type OAuthMetadata,
} from "../lib/mcp-oauth.js";

type TxClient = Prisma.TransactionClient;

export type McpConnectionState = "connected" | "expired" | "disconnected";

/** OAuth context needed to drive the authorize/exchange/refresh flow for a server. */
export interface McpOAuthContext {
  server: McpServer;
  metadata: OAuthMetadata;
  clientId: string;
  clientSecret?: string;
}

/** A catalog provider combined with org enablement + a user's connection state. */
export interface McpCatalogProviderStatus {
  id: string;
  name: string;
  transport: string;
  oauthRedirectUri: string;
  needsClientCredentials: boolean;
  enabled: boolean;
  serverId: string | null;
  connectionState: McpConnectionState;
}

export interface EnableMcpOptions {
  clientId?: string;
  clientSecret?: string;
}

/** Public projection — never exposes client secret or cached metadata. */
export function mcpServerPayload(server: McpServer): Prisma.InputJsonObject {
  return {
    id: server.id,
    orgId: server.organizationId,
    organizationId: server.organizationId,
    catalogId: server.catalogId,
    name: server.name,
    url: server.url,
    transport: server.transport,
    enabled: server.enabled,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}

function connectionStateOf(connection: McpConnection | undefined): McpConnectionState {
  if (!connection) return "disconnected";
  if (
    connection.expiresAt &&
    connection.expiresAt.getTime() <= Date.now() &&
    !connection.encryptedRefreshToken
  ) {
    return "expired";
  }
  return "connected";
}

function metadataToJson(metadata: OAuthMetadata): Prisma.InputJsonObject {
  return { ...metadata } as unknown as Prisma.InputJsonObject;
}

function jsonToMetadata(value: Prisma.JsonValue | null): OAuthMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const doc = value as Record<string, unknown>;
  if (typeof doc.authorizationEndpoint !== "string" || typeof doc.tokenEndpoint !== "string") {
    return null;
  }
  return doc as unknown as OAuthMetadata;
}

export class McpServerService {
  /** Catalog grid for a user: availability, org enablement, and connection state. */
  async listCatalog(
    userId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<McpCatalogProviderStatus[]> {
    await prisma.$transaction((tx: TxClient) =>
      assertActorOrgAccess(tx, organizationId, actorType, actorId),
    );
    const servers = await prisma.mcpServer.findMany({ where: { organizationId } });
    const serverByCatalog = new Map(servers.map((s) => [s.catalogId, s] as const));
    const connections = servers.length
      ? await prisma.mcpConnection.findMany({
          where: { userId, mcpServerId: { in: servers.map((s) => s.id) } },
        })
      : [];
    const connByServer = new Map(connections.map((c) => [c.mcpServerId, c] as const));

    return MCP_CATALOG.map((entry) => {
      const server = serverByCatalog.get(entry.id);
      const enabled = Boolean(server?.enabled);
      const connection = enabled && server ? connByServer.get(server.id) : undefined;
      return {
        id: entry.id,
        name: entry.name,
        transport: entry.transport,
        oauthRedirectUri: mcpRedirectUri(),
        needsClientCredentials: !server?.clientId && needsClientCredentials(entry),
        enabled,
        serverId: server?.id ?? null,
        connectionState: connectionStateOf(connection),
      };
    });
  }

  /** Enable a catalog provider for an org (admin only). Resolves the OAuth client. */
  async enable(
    organizationId: string,
    catalogId: string,
    actorType: ActorType,
    actorId: string,
    options: EnableMcpOptions = {},
  ): Promise<McpServer> {
    const entry = getMcpCatalogEntry(catalogId);
    if (!entry) throw new Error("Unknown MCP provider");

    // Authorize BEFORE any network side effects (SSRF + DCR are observable).
    await prisma.$transaction((tx: TxClient) =>
      assertActorOrgAdmin(tx, organizationId, actorType, actorId),
    );
    const conflict = await prisma.mcpServer.findUnique({
      where: { organizationId_catalogId: { organizationId, catalogId } },
      select: { id: true, enabled: true },
    });
    if (conflict) {
      if (conflict.enabled) throw new Error(`${entry.name} is already enabled`);
      return this.update(conflict.id, { enabled: true }, actorType, actorId);
    }

    // Resolve pre-registered credentials up front: prefer environment config,
    // otherwise accept admin-supplied client credentials.
    let preCreds: { clientId: string; clientSecret?: string } | null = null;
    if (entry.auth.strategy === "preregistered") {
      preCreds =
        preregisteredClient(entry) ??
        (options.clientId
          ? { clientId: options.clientId.trim(), clientSecret: options.clientSecret?.trim() }
          : null);
      if (!preCreds) {
        throw new Error(`${entry.name} requires an OAuth client ID and secret`);
      }
    }

    const metadata = await discoverOAuthMetadata(entry.url);
    let clientId: string;
    let secret: { encrypted: string; iv: string } | null = null;
    if (entry.auth.strategy === "dcr") {
      const client = await registerClient(metadata, mcpRedirectUri());
      clientId = client.clientId;
      secret = client.clientSecret ? encryptSecret(client.clientSecret) : null;
    } else {
      clientId = preCreds!.clientId;
      secret = preCreds!.clientSecret ? encryptSecret(preCreds!.clientSecret) : null;
    }

    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAdmin(tx, organizationId, actorType, actorId);
      const created = await tx.mcpServer.create({
        data: {
          organizationId,
          catalogId,
          name: entry.name,
          url: entry.url,
          transport: entry.transport,
          oauthMetadata: metadataToJson(metadata),
          clientId,
          encryptedClientSecret: secret?.encrypted ?? null,
          clientSecretIv: secret?.iv ?? null,
        },
      });

      await eventService.create(
        {
          organizationId: created.organizationId,
          scopeType: "system",
          scopeId: created.organizationId,
          eventType: "mcp_server_created",
          payload: { mcpServer: mcpServerPayload(created) },
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
    input: { enabled?: boolean },
    actorType: ActorType,
    actorId: string,
  ): Promise<McpServer> {
    const existing = await prisma.mcpServer.findUniqueOrThrow({ where: { id } });
    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAdmin(tx, existing.organizationId, actorType, actorId);
      const updated = await tx.mcpServer.update({
        where: { id },
        data: { ...(input.enabled !== undefined ? { enabled: input.enabled } : {}) },
      });

      await eventService.create(
        {
          organizationId: updated.organizationId,
          scopeType: "system",
          scopeId: updated.organizationId,
          eventType: "mcp_server_updated",
          payload: { mcpServer: mcpServerPayload(updated) },
          actorType,
          actorId,
        },
        tx,
      );

      return updated;
    });
  }

  async delete(id: string, actorType: ActorType, actorId: string): Promise<boolean> {
    await prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.mcpServer.findUniqueOrThrow({ where: { id } });
      await assertActorOrgAdmin(tx, existing.organizationId, actorType, actorId);
      const deleted = await tx.mcpServer.delete({ where: { id } });

      await eventService.create(
        {
          organizationId: deleted.organizationId,
          scopeType: "system",
          scopeId: deleted.organizationId,
          eventType: "mcp_server_deleted",
          payload: { mcpServer: mcpServerPayload(deleted) },
          actorType,
          actorId,
        },
        tx,
      );
    });
    return true;
  }

  /** Resolve the OAuth context for driving authorize/exchange/refresh. */
  async resolveOAuthContext(serverId: string): Promise<McpOAuthContext> {
    const server = await prisma.mcpServer.findUniqueOrThrow({ where: { id: serverId } });
    const metadata =
      jsonToMetadata(server.oauthMetadata) ?? (await discoverOAuthMetadata(server.url));
    if (!server.clientId) {
      throw new Error("MCP server has no registered OAuth client");
    }
    const clientSecret =
      server.encryptedClientSecret && server.clientSecretIv
        ? decryptSecret(server.encryptedClientSecret, server.clientSecretIv)
        : undefined;
    return { server, metadata, clientId: server.clientId, clientSecret };
  }
}

export const mcpServerService = new McpServerService();
