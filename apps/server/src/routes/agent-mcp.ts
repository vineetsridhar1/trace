import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { authenticateAgentInvocationToken } from "../lib/agent-invocation-auth.js";
import { ValidationError } from "../lib/errors.js";
import { agentIntegrationService } from "../services/agent-integrations.js";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SEARCH_TOOL = "search_integrations";
const CALL_TOOL = "call_integration";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export const agentMcpRouter: ExpressRouter = Router();

function bearerToken(request: Request): string | null {
  const match = request.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rpcResult(response: Response, id: JsonRpcRequest["id"], result: unknown) {
  response
    .status(200)
    .set("Cache-Control", "no-store")
    .json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(response: Response, id: JsonRpcRequest["id"], code: number, message: string) {
  response
    .status(200)
    .set("Cache-Control", "no-store")
    .json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

function integrationTools() {
  return [
    {
      name: SEARCH_TOOL,
      description:
        "Find tools from the current user's connected integrations. Returns exact input schemas to use with call_integration.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "What provider, data, or operation you need. Use an empty string to browse.",
          },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: CALL_TOOL,
      description:
        "Call a tool returned by search_integrations using its connectionId, toolId, and exact input schema.",
      inputSchema: {
        type: "object",
        properties: {
          connectionId: { type: "string" },
          toolId: { type: "string" },
          arguments: { type: "object" },
        },
        required: ["connectionId", "toolId", "arguments"],
        additionalProperties: false,
      },
    },
  ];
}

agentMcpRouter.post("/agent/mcp", async (request: Request, response: Response) => {
  const token = bearerToken(request);
  const subject = token ? await authenticateAgentInvocationToken(token) : null;
  if (!subject) {
    response
      .status(401)
      .set("Cache-Control", "no-store")
      .set("WWW-Authenticate", 'Bearer realm="trace-mcp"')
      .json({ error: "Invalid agent invocation" });
    return;
  }
  const message = asRecord(request.body) as JsonRpcRequest | null;
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    rpcError(response, message?.id, -32600, "Invalid Request");
    return;
  }
  if (message.id === undefined) {
    response.status(202).end();
    return;
  }
  try {
    if (message.method === "initialize") {
      rpcResult(response, message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "trace-integrations", version: "1.0.0" },
      });
      return;
    }
    if (message.method === "ping") {
      rpcResult(response, message.id, {});
      return;
    }
    if (message.method === "tools/list") {
      rpcResult(response, message.id, { tools: integrationTools() });
      return;
    }
    if (message.method !== "tools/call") {
      rpcError(response, message.id, -32601, "Method not found");
      return;
    }
    const params = asRecord(message.params);
    const args = asRecord(params?.arguments);
    if (!params || typeof params.name !== "string" || !args) {
      throw new ValidationError("Invalid tool call");
    }
    if (params.name === SEARCH_TOOL) {
      if (typeof args.query !== "string") throw new ValidationError("Search query is required");
      if (args.limit !== undefined && typeof args.limit !== "number") {
        throw new ValidationError("Search limit must be a number");
      }
      const tools = await agentIntegrationService.searchTools(subject, args.query, args.limit);
      rpcResult(response, message.id, {
        content: [{ type: "text", text: JSON.stringify({ tools }) }],
        structuredContent: { tools },
      });
      return;
    }
    if (params.name === CALL_TOOL) {
      const toolArguments = asRecord(args.arguments);
      if (
        typeof args.connectionId !== "string" ||
        typeof args.toolId !== "string" ||
        !toolArguments
      ) {
        throw new ValidationError("Connection, tool, and arguments are required");
      }
      const result = await agentIntegrationService.callTool(subject, {
        connectionId: args.connectionId,
        toolId: args.toolId,
        arguments: toolArguments,
      });
      rpcResult(response, message.id, result);
      return;
    }
    throw new ValidationError("Unknown integration tool");
  } catch (error: unknown) {
    rpcResult(response, message.id, {
      content: [
        { type: "text", text: error instanceof Error ? error.message : "Integration tool failed" },
      ],
      isError: true,
    });
  }
});

agentMcpRouter.get("/agent/mcp", (_request: Request, response: Response) => {
  response.status(405).set("Allow", "POST").end();
});
