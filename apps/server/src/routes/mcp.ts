import { Router, type Router as RouterType, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  registerObserveTools,
  registerDriveTools,
  StaticTraceClient,
} from "@trace/mcp/server";

type McpRouterOptions = {
  /** Loopback base URL the per-request client uses to reach GraphQL / auth. */
  loopbackBaseUrl: string;
  /** Verifies bearer access tokens (OAuth access tokens and agent/session JWTs). */
  verifier: OAuthTokenVerifier;
  /** Protected-resource metadata URL advertised in 401 WWW-Authenticate headers. */
  resourceMetadataUrl: string;
};

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function readAuthString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Hosted Streamable-HTTP MCP endpoint. Any MCP client (cloud pod, laptop,
 * future local Electron session) connects with a Trace bearer token exactly
 * like any other remote MCP server. `requireBearerAuth` validates the token and
 * advertises the OAuth resource metadata on 401 so clients can self-authorize.
 * Runs stateless: a fresh MCP server and transport are built per request, and
 * tool execution loops back through the server's own `/graphql` so it takes the
 * real auth path.
 */
export function createMcpRouter(options: McpRouterOptions): RouterType {
  const router: RouterType = Router();

  const bearerAuth = requireBearerAuth({
    verifier: options.verifier,
    resourceMetadataUrl: options.resourceMetadataUrl,
  });

  router.post("/mcp", bearerAuth, async (req: Request, res: Response) => {
    const auth = req.auth;
    if (!auth) {
      jsonRpcError(res, 401, -32001, "Missing Trace bearer token");
      return;
    }

    const extra = auth.extra ?? {};
    const client = new StaticTraceClient({
      baseUrl: options.loopbackBaseUrl,
      token: auth.token,
      organizationId: readAuthString(extra.organizationId),
      channelId: readAuthString(extra.channelId),
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
