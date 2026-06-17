import type { ActorType } from "@trace/gql";
import { Prisma, type McpConnection, type McpServer } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { eventService } from "./event.js";
import { mcpServerService } from "./mcp-server.js";
import { refreshToken } from "../lib/mcp-oauth.js";

type TxClient = Prisma.TransactionClient;

/** Refresh the access token if it expires within this window. */
const REFRESH_LEEWAY_MS = 60 * 1000;

export type McpConnectionState = "connected" | "expired" | "disconnected";

export interface McpConnectionStatus {
  server: McpServer;
  state: McpConnectionState;
  expiresAt: Date | null;
  scope: string | null;
  updatedAt: Date | null;
}

export interface UpsertTokensInput {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

function connectionState(connection: McpConnection | undefined): McpConnectionState {
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

function connectionPayload(connection: McpConnection): Prisma.InputJsonObject {
  return {
    mcpServerId: connection.mcpServerId,
    userId: connection.userId,
    expiresAt: connection.expiresAt?.toISOString() ?? null,
    scope: connection.scope ?? null,
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export class McpConnectionService {
  /** Per-server connection status for a user across the org's enabled servers. */
  async listForUser(userId: string, organizationId: string): Promise<McpConnectionStatus[]> {
    const [servers, connections] = await Promise.all([
      prisma.mcpServer.findMany({
        where: { organizationId, enabled: true },
        orderBy: { name: "asc" },
      }),
      prisma.mcpConnection.findMany({ where: { userId } }),
    ]);
    const byServerId = new Map(connections.map((c) => [c.mcpServerId, c] as const));
    return servers.map((server) => {
      const connection = byServerId.get(server.id);
      return {
        server,
        state: connectionState(connection),
        expiresAt: connection?.expiresAt ?? null,
        scope: connection?.scope ?? null,
        updatedAt: connection?.updatedAt ?? null,
      };
    });
  }

  async upsertTokens(
    userId: string,
    mcpServerId: string,
    tokens: UpsertTokensInput,
  ): Promise<McpConnection> {
    const access = encryptSecret(tokens.accessToken);
    const refresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;

    return prisma.$transaction(async (tx: TxClient) => {
      const server = await tx.mcpServer.findUniqueOrThrow({ where: { id: mcpServerId } });
      const connection = await tx.mcpConnection.upsert({
        where: { userId_mcpServerId: { userId, mcpServerId } },
        create: {
          userId,
          mcpServerId,
          encryptedAccessToken: access.encrypted,
          accessIv: access.iv,
          encryptedRefreshToken: refresh?.encrypted ?? null,
          refreshIv: refresh?.iv ?? null,
          expiresAt: tokens.expiresAt ?? null,
          scope: tokens.scope ?? null,
        },
        update: {
          encryptedAccessToken: access.encrypted,
          accessIv: access.iv,
          encryptedRefreshToken: refresh?.encrypted ?? null,
          refreshIv: refresh?.iv ?? null,
          expiresAt: tokens.expiresAt ?? null,
          scope: tokens.scope ?? null,
        },
      });

      await eventService.create(
        {
          organizationId: server.organizationId,
          scopeType: "system",
          scopeId: server.organizationId,
          eventType: "mcp_connection_created",
          payload: { mcpConnection: connectionPayload(connection) },
          actorType: "user",
          actorId: userId,
        },
        tx,
      );

      return connection;
    });
  }

  async delete(userId: string, mcpServerId: string): Promise<boolean> {
    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.mcpConnection.findUnique({
        where: { userId_mcpServerId: { userId, mcpServerId } },
      });
      if (!existing) return false;
      const server = await tx.mcpServer.findUniqueOrThrow({ where: { id: mcpServerId } });
      await tx.mcpConnection.delete({
        where: { userId_mcpServerId: { userId, mcpServerId } },
      });

      await eventService.create(
        {
          organizationId: server.organizationId,
          scopeType: "system",
          scopeId: server.organizationId,
          eventType: "mcp_connection_deleted",
          payload: { mcpConnection: connectionPayload(existing) },
          actorType: "user",
          actorId: userId,
        },
        tx,
      );

      return true;
    });
  }

  /**
   * Decrypt the user's access token for a server, refreshing it first when it
   * is at or near expiry and a refresh token is available. Returns null when
   * the user has no usable connection. Used at session launch.
   */
  async resolveFreshAccessToken(userId: string, mcpServerId: string): Promise<string | null> {
    const connection = await prisma.mcpConnection.findUnique({
      where: { userId_mcpServerId: { userId, mcpServerId } },
    });
    if (!connection) return null;

    const expiringSoon =
      connection.expiresAt !== null &&
      connection.expiresAt.getTime() - Date.now() <= REFRESH_LEEWAY_MS;

    if (expiringSoon && connection.encryptedRefreshToken && connection.refreshIv) {
      const currentRefresh = decryptSecret(connection.encryptedRefreshToken, connection.refreshIv);
      const { metadata, clientId, clientSecret } =
        await mcpServerService.resolveOAuthContext(mcpServerId);
      const refreshed = await refreshToken({
        metadata,
        clientId,
        clientSecret,
        refreshToken: currentRefresh,
        scope: connection.scope ?? undefined,
      });
      await this.upsertTokens(userId, mcpServerId, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        scope: refreshed.scope ?? connection.scope ?? undefined,
      });
      return refreshed.accessToken;
    }

    return decryptSecret(connection.encryptedAccessToken, connection.accessIv);
  }
}

export const mcpConnectionService = new McpConnectionService();
