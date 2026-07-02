import { Router, type Router as RouterType, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerObserveTools,
  registerDriveTools,
  StaticTraceClient,
} from "@trace/mcp/server";
import { authenticateAccessToken, getRequestToken } from "../lib/auth.js";

type McpRouterOptions = {
  /** Loopback base URL the per-request client uses to reach GraphQL / auth. */
  loopbackBaseUrl: string;
};

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

/**
 * Hosted Streamable-HTTP MCP endpoint. Any MCP client (cloud pod, laptop,
 * future local Electron session) connects with a Trace bearer token exactly
 * like any other remote MCP server. Runs stateless: a fresh MCP server and
 * transport are built per request, and tool execution loops back through the
 * server's own `/graphql` so it takes the real auth path.
 */
export function createMcpRouter(options: McpRouterOptions): RouterType {
  const router: RouterType = Router();

  router.post("/mcp", async (req: Request, res: Response) => {
    const token = getRequestToken(req);
    if (!token) {
      jsonRpcError(res, 401, -32001, "Missing Trace bearer token");
      return;
    }

    const subject = await authenticateAccessToken(token);
    if (!subject || subject.kind !== "session") {
      jsonRpcError(res, 401, -32001, "Invalid Trace bearer token");
      return;
    }

    const client = new StaticTraceClient({
      baseUrl: options.loopbackBaseUrl,
      token,
      organizationId: subject.organizationId,
      channelId: subject.channelId,
    });

    const server = new McpServer({ name: "trace-mcp", version: "0.1.0" });
    registerObserveTools(server, client);
    registerDriveTools(server, client);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[mcp] request failed:", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        jsonRpcError(res, 500, -32603, "Internal MCP server error");
      }
    }
  });

  // Stateless mode has no session to resume; the SDK's GET handler would open a
  // never-emitting SSE stream, so reject the streaming/close verbs explicitly.
  const methodNotAllowed = (_req: Request, res: Response): void => {
    res.setHeader("Allow", "POST");
    jsonRpcError(res, 405, -32000, "Method not allowed");
  };
  router.get("/mcp", methodNotAllowed);
  router.delete("/mcp", methodNotAllowed);

  return router;
}
