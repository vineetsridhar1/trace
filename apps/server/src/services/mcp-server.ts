import type { ActorType } from "@trace/gql";
import { Prisma, type McpServer } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess, assertActorOrgAdmin } from "./actor-auth.js";
import {
  discoverOAuthMetadata,
  mcpRedirectUri,
  registerClient,
  type OAuthMetadata,
} from "../lib/mcp-oauth.js";

type TxClient = Prisma.TransactionClient;

const VALID_TRANSPORTS = new Set(["http", "sse"]);

export interface McpServerInput {
  organizationId: string;
  name: string;
  url: string;
  transport?: string;
}

export interface McpServerUpdateInput {
  name?: string;
  url?: string;
  transport?: string;
  enabled?: boolean;
}

/** OAuth context needed to drive the authorize/exchange/refresh flow for a server. */
export interface McpOAuthContext {
  server: McpServer;
  metadata: OAuthMetadata;
  clientId: string;
  clientSecret?: string;
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("MCP server name is required");
  return normalized;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("MCP server url must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MCP server url must use http:// or https://");
  }
  return trimmed;
}

function normalizeTransport(transport: string | undefined): string {
  const value = (transport ?? "http").trim();
  if (!VALID_TRANSPORTS.has(value)) {
    throw new Error("MCP server transport must be 'http' or 'sse'");
  }
  return value;
}

/** Public projection — never exposes client secret or cached metadata. */
export function mcpServerPayload(server: McpServer): Prisma.InputJsonObject {
  return {
    id: server.id,
    orgId: server.organizationId,
    organizationId: server.organizationId,
    name: server.name,
    url: server.url,
    transport: server.transport,
    enabled: server.enabled,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}

function metadataToJson(metadata: OAuthMetadata): Prisma.InputJsonObject {
  return { ...metadata } as unknown as Prisma.InputJsonObject;
}

function jsonToMetadata(value: Prisma.JsonValue | null): OAuthMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const doc = value as Record<string, unknown>;
  if (
    typeof doc.authorizationEndpoint !== "string" ||
    typeof doc.tokenEndpoint !== "string"
  ) {
    return null;
  }
  return doc as unknown as OAuthMetadata;
}

export class McpServerService {
  async list(organizationId: string, actorType: ActorType, actorId: string) {
    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      return tx.mcpServer.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
      });
    });
  }

  async create(input: McpServerInput, actorType: ActorType, actorId: string) {
    const name = normalizeName(input.name);
    const url = normalizeUrl(input.url);
    const transport = normalizeTransport(input.transport);

    // OAuth discovery + dynamic client registration happen outside the
    // transaction — they make network calls and must not hold a DB lock.
    const metadata = await discoverOAuthMetadata(url);
    const client = await registerClient(metadata, mcpRedirectUri());
    const secret = client.clientSecret ? encryptSecret(client.clientSecret) : null;

    return prisma.$transaction(async (tx: TxClient) => {
      await assertActorOrgAdmin(tx, input.organizationId, actorType, actorId);
      const created = await tx.mcpServer.create({
        data: {
          organizationId: input.organizationId,
          name,
          url,
          transport,
          oauthMetadata: metadataToJson(metadata),
          clientId: client.clientId,
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
    input: McpServerUpdateInput,
    actorType: ActorType,
    actorId: string,
  ) {
    const name = input.name !== undefined ? normalizeName(input.name) : undefined;
    const url = input.url !== undefined ? normalizeUrl(input.url) : undefined;
    const transport = input.transport !== undefined ? normalizeTransport(input.transport) : undefined;

    // If the URL changes, re-discover metadata and re-register the client.
    let rediscovered: { metadata: OAuthMetadata; clientId: string; secret: { encrypted: string; iv: string } | null } | null =
      null;
    if (url !== undefined) {
      const existing = await prisma.mcpServer.findUniqueOrThrow({ where: { id } });
      if (url !== existing.url) {
        const metadata = await discoverOAuthMetadata(url);
        const client = await registerClient(metadata, mcpRedirectUri());
        rediscovered = {
          metadata,
          clientId: client.clientId,
          secret: client.clientSecret ? encryptSecret(client.clientSecret) : null,
        };
      }
    }

    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.mcpServer.findUniqueOrThrow({ where: { id } });
      await assertActorOrgAdmin(tx, existing.organizationId, actorType, actorId);

      const updated = await tx.mcpServer.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(url !== undefined ? { url } : {}),
          ...(transport !== undefined ? { transport } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(rediscovered
            ? {
                oauthMetadata: metadataToJson(rediscovered.metadata),
                clientId: rediscovered.clientId,
                encryptedClientSecret: rediscovered.secret?.encrypted ?? null,
                clientSecretIv: rediscovered.secret?.iv ?? null,
              }
            : {}),
        },
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
