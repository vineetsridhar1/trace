import type { ActorType, McpConnectionState } from "@trace/gql";
import { Prisma, type McpConnection, type McpServer } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { mcpServerService } from "./mcp-server.js";
import { refreshToken, revokeToken } from "../lib/mcp-oauth.js";

type TxClient = Prisma.TransactionClient;

/** Refresh the access token if it expires within this window. */
const REFRESH_LEEWAY_MS = 60 * 1000;

/**
 * In-flight refreshes keyed by `${userId}:${mcpServerId}` so concurrent session
 * launches for the same connection share one refresh round-trip instead of
 * racing — important for providers that rotate refresh tokens on use.
 */
const inflightRefreshes = new Map<string, Promise<string | null>>();

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

/** Sanitize an admin-chosen server name into a Claude Code mcpServers key. */
function mcpServerKey(name: string, fallbackId: string): string {
  const key = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "");
  return key || fallbackId;
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
  async listForUser(
    userId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<McpConnectionStatus[]> {
    await prisma.$transaction((tx: TxClient) =>
      assertActorOrgAccess(tx, organizationId, actorType, actorId),
    );
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

  /** Store tokens from the OAuth callback and announce the new connection. */
  async upsertTokens(
    userId: string,
    mcpServerId: string,
    tokens: UpsertTokensInput,
  ): Promise<McpConnection> {
    return this.persistTokens(userId, mcpServerId, tokens, { emit: true });
  }

  private async persistTokens(
    userId: string,
    mcpServerId: string,
    tokens: UpsertTokensInput,
    options: { emit: boolean },
  ): Promise<McpConnection> {
    const access = encryptSecret(tokens.accessToken);
    const refresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;
    const data = {
      encryptedAccessToken: access.encrypted,
      accessIv: access.iv,
      encryptedRefreshToken: refresh?.encrypted ?? null,
      refreshIv: refresh?.iv ?? null,
      expiresAt: tokens.expiresAt ?? null,
      scope: tokens.scope ?? null,
    };

    return prisma.$transaction(async (tx: TxClient) => {
      const server = await tx.mcpServer.findUniqueOrThrow({ where: { id: mcpServerId } });
      const connection = await tx.mcpConnection.upsert({
        where: { userId_mcpServerId: { userId, mcpServerId } },
        create: { userId, mcpServerId, ...data },
        update: data,
      });

      // A launch-time refresh is not a new connection — only the OAuth callback
      // path emits, to avoid org-wide event spam on every session start.
      if (options.emit) {
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
      }

      return connection;
    });
  }

  async delete(userId: string, mcpServerId: string): Promise<boolean> {
    const existing = await prisma.mcpConnection.findUnique({
      where: { userId_mcpServerId: { userId, mcpServerId } },
    });
    if (!existing) return false;

    await prisma.$transaction(async (tx: TxClient) => {
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
    });

    // Best-effort provider-side revocation — courtesy cleanup, never blocks.
    void this.revokeConnectionTokens(existing);
    return true;
  }

  /**
   * Build the Claude-Code-compatible mcpServers config for a user's connected
   * servers in an org, resolving a fresh token per server (refreshing as
   * needed). One query, parallel refreshes, fails open per server. No
   * membership assertion — the caller (session launch) already owns the trust
   * boundary. Returns undefined when there's nothing to inject.
   */
  async resolveLaunchMcpConfig(
    userId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const connections = await prisma.mcpConnection.findMany({
      where: { userId, mcpServer: { organizationId, enabled: true } },
      include: { mcpServer: true },
    });
    if (connections.length === 0) return undefined;

    const entries = await Promise.all(
      connections.map(async (connection) => {
        try {
          const token = await this.freshTokenFromConnection(connection);
          if (!token) return null;
          return [
            mcpServerKey(connection.mcpServer.name, connection.mcpServer.id),
            {
              type: connection.mcpServer.transport,
              url: connection.mcpServer.url,
              headers: { Authorization: `Bearer ${token}` },
            },
          ] as const;
        } catch (err) {
          console.error(
            `[mcp-connection] token resolution failed for ${connection.mcpServer.name}:`,
            (err as Error).message,
          );
          return null;
        }
      }),
    );

    const config: Record<string, unknown> = {};
    for (const entry of entries) {
      if (entry) config[entry[0]] = entry[1];
    }
    return Object.keys(config).length > 0 ? config : undefined;
  }

  /**
   * Decrypt the user's access token for a server, refreshing first when it is
   * at or near expiry and a refresh token is available. Returns null when the
   * user has no usable connection.
   */
  async resolveFreshAccessToken(userId: string, mcpServerId: string): Promise<string | null> {
    const connection = await prisma.mcpConnection.findUnique({
      where: { userId_mcpServerId: { userId, mcpServerId } },
    });
    if (!connection) return null;
    return this.freshTokenFromConnection(connection);
  }

  private async freshTokenFromConnection(connection: McpConnection): Promise<string | null> {
    const expiringSoon =
      connection.expiresAt !== null &&
      connection.expiresAt.getTime() - Date.now() <= REFRESH_LEEWAY_MS;

    if (!expiringSoon || !connection.encryptedRefreshToken || !connection.refreshIv) {
      return decryptSecret(connection.encryptedAccessToken, connection.accessIv);
    }

    const key = `${connection.userId}:${connection.mcpServerId}`;
    const inflight = inflightRefreshes.get(key);
    if (inflight) return inflight;

    const promise = this.performRefresh(connection).finally(() => inflightRefreshes.delete(key));
    inflightRefreshes.set(key, promise);
    return promise;
  }

  private async performRefresh(connection: McpConnection): Promise<string | null> {
    try {
      const currentRefresh = decryptSecret(
        connection.encryptedRefreshToken!,
        connection.refreshIv!,
      );
      const { metadata, clientId, clientSecret } = await mcpServerService.resolveOAuthContext(
        connection.mcpServerId,
      );
      const refreshed = await refreshToken({
        metadata,
        clientId,
        clientSecret,
        refreshToken: currentRefresh,
        scope: connection.scope ?? undefined,
      });
      await this.persistTokens(
        connection.userId,
        connection.mcpServerId,
        {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
          scope: refreshed.scope ?? connection.scope ?? undefined,
        },
        { emit: false },
      );
      return refreshed.accessToken;
    } catch (err) {
      console.error(
        `[mcp-connection] refresh failed for server ${connection.mcpServerId}:`,
        (err as Error).message,
      );
      // Fall back to the current access token if it hasn't actually expired yet
      // (we refresh proactively within a leeway window).
      const stillValid =
        connection.expiresAt !== null && connection.expiresAt.getTime() > Date.now();
      return stillValid
        ? decryptSecret(connection.encryptedAccessToken, connection.accessIv)
        : null;
    }
  }

  private async revokeConnectionTokens(connection: McpConnection): Promise<void> {
    try {
      const { metadata, clientId, clientSecret } = await mcpServerService.resolveOAuthContext(
        connection.mcpServerId,
      );
      if (connection.encryptedRefreshToken && connection.refreshIv) {
        await revokeToken({
          metadata,
          clientId,
          clientSecret,
          token: decryptSecret(connection.encryptedRefreshToken, connection.refreshIv),
          tokenTypeHint: "refresh_token",
        });
      }
      await revokeToken({
        metadata,
        clientId,
        clientSecret,
        token: decryptSecret(connection.encryptedAccessToken, connection.accessIv),
        tokenTypeHint: "access_token",
      });
    } catch {
      // Revocation is best-effort; the local connection is already gone.
    }
  }
}

export const mcpConnectionService = new McpConnectionService();
