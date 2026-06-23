import type { Context } from "../context.js";
import type {
  EnableMcpServerInput,
  UpdateMcpServerInput,
  McpServerTransport,
} from "@trace/gql";
import { mcpServerService } from "../services/mcp-server.js";
import { mcpConnectionService } from "../services/mcp-connection.js";

export const mcpQueries = {
  mcpCatalog: (_: unknown, args: { orgId: string }, ctx: Context) => {
    return mcpServerService.listCatalog(ctx.userId, args.orgId, ctx.actorType, ctx.userId);
  },
};

export const mcpMutations = {
  enableMcpServer: (_: unknown, args: { input: EnableMcpServerInput }, ctx: Context) => {
    return mcpServerService.enable(args.input.orgId, args.input.catalogId, ctx.actorType, ctx.userId, {
      clientId: args.input.clientId ?? undefined,
      clientSecret: args.input.clientSecret ?? undefined,
    });
  },

  updateMcpServer: (_: unknown, args: { input: UpdateMcpServerInput }, ctx: Context) => {
    return mcpServerService.update(
      args.input.id,
      { enabled: args.input.enabled ?? undefined },
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
  McpCatalogProvider: {
    transport: (provider: { transport: string }) => provider.transport as McpServerTransport,
  },
};
