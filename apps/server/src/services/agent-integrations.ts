import type { Prisma } from "@prisma/client";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import type { AgentInvocationAuthSubject } from "../lib/agent-invocation-auth.js";
import { prisma } from "../lib/db.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors.js";
import { eventService } from "./event.js";
import type {
  IntegrationToolDefinition,
  IntegrationToolProvider,
} from "./integration-connection-provider.js";
import { nangoConnectionProvider } from "./nango-connection-provider.js";

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

type PersonalConnection = {
  id: string;
  provider: string;
  providerConfigKey: string;
  nangoConnectionId: string;
  displayName: string;
  updatedAt: Date;
};

export type AgentIntegrationTool = {
  connectionId: string;
  connectionName: string;
  provider: string;
  toolId: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
};

type ToolCacheEntry = { expiresAt: number; tools: IntegrationToolDefinition[] };

function searchScore(tool: AgentIntegrationTool, terms: string[]): number {
  if (terms.length === 0) return 1;
  const provider = `${tool.provider} ${tool.connectionName}`.toLowerCase();
  const operation = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (provider.includes(term)) score += 4;
    if (operation.includes(term)) score += 2;
  }
  return score;
}

export class AgentIntegrationService {
  private readonly cache = new Map<string, ToolCacheEntry>();

  constructor(private readonly provider: IntegrationToolProvider) {}

  async searchTools(
    subject: AgentInvocationAuthSubject,
    query: string,
    requestedLimit?: number,
  ): Promise<AgentIntegrationTool[]> {
    this.assertInvokeCapability(subject);
    const limit = requestedLimit ?? DEFAULT_SEARCH_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      throw new ValidationError(`Tool search limit must be between 1 and ${MAX_SEARCH_LIMIT}`);
    }
    const connections = await this.personalConnections(subject);
    const discovered = await Promise.all(
      connections.map(async (connection) => {
        try {
          const tools = await this.toolsForConnection(connection);
          return tools.map((tool) => this.publicTool(connection, tool));
        } catch (error: unknown) {
          console.warn("[agent-integrations] tool discovery failed", {
            connectionId: connection.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }
      }),
    );
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return discovered
      .flat()
      .map((tool) => ({ tool, score: searchScore(tool, terms) }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name),
      )
      .slice(0, limit)
      .map((candidate) => candidate.tool);
  }

  async callTool(
    subject: AgentInvocationAuthSubject,
    input: { connectionId: string; toolId: string; arguments: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    this.assertInvokeCapability(subject);
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        id: input.connectionId,
        organizationId: subject.organizationId,
        ownerUserId: subject.userId,
        kind: "personal",
        status: "active",
      },
      select: {
        id: true,
        provider: true,
        providerConfigKey: true,
        nangoConnectionId: true,
        displayName: true,
        updatedAt: true,
      },
    });
    if (!connection) throw new NotFoundError("Integration connection", input.connectionId);
    const tools = await this.toolsForConnection(connection);
    if (!tools.some((tool) => tool.id === input.toolId)) {
      throw new AuthorizationError("This integration tool is unavailable");
    }
    const startedAt = Date.now();
    let succeeded = false;
    try {
      const result = await this.provider.callTool({
        connectionId: connection.nangoConnectionId,
        providerConfigKey: connection.providerConfigKey,
        toolId: input.toolId,
        arguments: input.arguments,
      });
      succeeded = result.isError !== true;
      return result;
    } finally {
      await eventService
        .create({
          organizationId: subject.organizationId,
          scopeType: "session",
          scopeId: subject.sessionId,
          eventType: "integration_tool_called",
          payload: {
            connectionId: connection.id,
            provider: connection.provider,
            toolId: input.toolId,
            succeeded,
            durationMs: Date.now() - startedAt,
          } satisfies Prisma.InputJsonObject,
          actorType: "agent",
          actorId: TRACE_AI_USER_ID,
        })
        .catch((error: unknown) => {
          console.error("[agent-integrations] failed to record tool call", error);
        });
    }
  }

  private assertInvokeCapability(subject: AgentInvocationAuthSubject): void {
    if (!subject.capabilities.includes("integration:invoke")) {
      throw new AuthorizationError("Agent invocation cannot use integrations");
    }
  }

  private personalConnections(subject: AgentInvocationAuthSubject): Promise<PersonalConnection[]> {
    return prisma.integrationConnection.findMany({
      where: {
        organizationId: subject.organizationId,
        ownerUserId: subject.userId,
        kind: "personal",
        status: "active",
      },
      orderBy: [{ provider: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        provider: true,
        providerConfigKey: true,
        nangoConnectionId: true,
        displayName: true,
        updatedAt: true,
      },
    });
  }

  private async toolsForConnection(connection: PersonalConnection) {
    const key = `${connection.id}:${connection.updatedAt.getTime()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.tools;
    const tools = await this.provider.listTools({
      connectionId: connection.nangoConnectionId,
      providerConfigKey: connection.providerConfigKey,
    });
    this.cache.set(key, { expiresAt: Date.now() + TOOL_CACHE_TTL_MS, tools });
    return tools;
  }

  private publicTool(
    connection: PersonalConnection,
    tool: IntegrationToolDefinition,
  ): AgentIntegrationTool {
    return {
      connectionId: connection.id,
      connectionName: connection.displayName,
      provider: connection.provider,
      toolId: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  }
}

export const agentIntegrationService = new AgentIntegrationService(nangoConnectionProvider);
