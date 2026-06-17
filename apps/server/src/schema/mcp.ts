import type { Context } from "../context.js";
import type {
  CreateMcpServerInput,
  UpdateMcpServerInput,
  McpServerTransport,
} from "@trace/gql";
import { mcpServerService } from "../services/mcp-server.js";
import { mcpConnectionService } from "../services/mcp-connection.js";

export const mcpQueries = {
  mcpServers: (_: unknown, args: { orgId: string }, ctx: Context) => {
    return mcpServerService.list(args.orgId, ctx.actorType, ctx.userId);
  },

  myMcpConnections: (_: unknown, args: { orgId: string }, ctx: Context) => {
    return mcpConnectionService.listForUser(ctx.userId, args.orgId, ctx.actorType, ctx.userId);
  },
};

export const mcpMutations = {
  createMcpServer: (_: unknown, args: { input: CreateMcpServerInput }, ctx: Context) => {
    return mcpServerService.create(
      {
        organizationId: args.input.orgId,
        name: args.input.name,
        url: args.input.url,
        transport: args.input.transport ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },

  updateMcpServer: (_: unknown, args: { input: UpdateMcpServerInput }, ctx: Context) => {
    return mcpServerService.update(
      args.input.id,
      {
        name: args.input.name ?? undefined,
        url: args.input.url ?? undefined,
        transport: args.input.transport ?? undefined,
        enabled: args.input.enabled ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },

  deleteMcpServer: (_: unknown, args: { id: string }, ctx: Context) => {
    return mcpServerService.delete(args.id, ctx.actorType, ctx.userId);
  },

  disconnectMcp: (_: unknown, args: { mcpServerId: string }, ctx: Context) => {
    return mcpConnectionService.delete(ctx.userId, args.mcpServerId);
  },
};

export const mcpTypeResolvers = {
  McpServer: {
    orgId: (server: { organizationId: string }) => server.organizationId,
    transport: (server: { transport: string }) => server.transport as McpServerTransport,
  },
  McpConnectionStatus: {
    mcpServer: (status: { server: unknown }) => status.server,
  },
};
