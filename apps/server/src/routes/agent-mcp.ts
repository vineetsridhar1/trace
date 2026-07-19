import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { verifyAgentMcpToken, type AgentMcpTokenPayload } from "../lib/auth.js";
import { sessionApplicationService } from "../services/session-applications.js";
import { sessionService } from "../services/session.js";
import { sessionTimelineService } from "../services/session-timeline.js";

type McpResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function result(value: unknown): McpResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown): McpResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

function bearer(req: Request): string | null {
  const value = req.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : null;
}

async function scopedSession(principal: AgentMcpTokenPayload) {
  const session = await sessionService.get(
    principal.sessionId,
    principal.organizationId,
    principal.userId,
  );
  if (!session || session.sessionGroupId !== principal.sessionGroupId) {
    throw new Error("The MCP capability is no longer valid for this session group");
  }
  return session;
}

async function scopedGroup(principal: AgentMcpTokenPayload) {
  await scopedSession(principal);
  const group = await sessionService.getGroup(
    principal.sessionGroupId,
    principal.organizationId,
    principal.userId,
  );
  if (!group) throw new Error("Session group is unavailable");
  return group;
}

function withErrors<T extends Record<string, unknown>>(
  operation: (args: T) => Promise<McpResult>,
): (args: T) => Promise<McpResult> {
  return async (args) => {
    try {
      return await operation(args);
    } catch (error) {
      return failure(error);
    }
  };
}

function createServer(principal: AgentMcpTokenPayload): McpServer {
  const server = new McpServer({ name: "trace-agent-mcp", version: "0.1.0" });

  server.registerTool(
    "get_current_session",
    {
      title: "Get current Trace session",
      description: "Read the current coding, design, app, or PDF session and its session-group metadata.",
      inputSchema: {},
    },
    withErrors(async () => result({ session: await scopedSession(principal), group: await scopedGroup(principal) })),
  );

  server.registerTool(
    "get_session_timeline",
    {
      title: "Read current session timeline",
      description: "Read recent Trace events and agent output for this session.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    withErrors(async ({ limit }) => {
      await scopedSession(principal);
      return result(
        await sessionTimelineService.query({
          organizationId: principal.organizationId,
          sessionId: principal.sessionId,
          limit: limit ?? 50,
        }),
      );
    }),
  );

  server.registerTool(
    "read_workspace_file",
    {
      title: "Read a workspace file",
      description: "Read a file from the current session group's workspace branch.",
      inputSchema: { path: z.string().min(1).max(1024) },
    },
    withErrors(async ({ path }) => {
      await scopedGroup(principal);
      return result({
        path,
        content: await sessionService.readFile(
          principal.sessionGroupId,
          path,
          principal.organizationId,
          principal.userId,
        ),
      });
    }),
  );

  server.registerTool(
    "list_application_processes",
    {
      title: "List workspace processes",
      description: "List managed app processes and preview endpoints for this app or design workspace.",
      inputSchema: {},
    },
    withErrors(async () => {
      await scopedGroup(principal);
      const processes = await sessionApplicationService.listProcesses(
        principal.sessionGroupId,
        principal.organizationId,
        principal.userId,
      );
      const endpoints = await sessionApplicationService.listEndpoints(
        principal.sessionGroupId,
        principal.organizationId,
        principal.userId,
      );
      return result({ processes, endpoints });
    }),
  );

  server.registerTool(
    "read_process_logs",
    {
      title: "Read process logs",
      description: "Read recent stdout/stderr log entries for one managed process in this workspace.",
      inputSchema: {
        processId: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
        beforeSequence: z.number().int().positive().optional(),
      },
    },
    withErrors(async ({ processId, limit, beforeSequence }) => {
      const processes = await sessionApplicationService.listProcesses(
        principal.sessionGroupId,
        principal.organizationId,
        principal.userId,
      );
      if (!processes.some((process) => process.id === processId)) {
        throw new Error("Process does not belong to this session group");
      }
      const logs = await sessionApplicationService.listLogs(
        processId,
        principal.organizationId,
        principal.userId,
        { limit, beforeSequence },
      );
      return result({ logs: [...logs].reverse() });
    }),
  );

  server.registerTool(
    "restart_application_process",
    {
      title: "Restart a workspace process",
      description: "Restart a configured dev server or other managed workspace process.",
      inputSchema: { appConfigId: z.string().min(1), processConfigId: z.string().min(1) },
    },
    withErrors(async ({ appConfigId, processConfigId }) => {
      await scopedGroup(principal);
      return result(
        await sessionApplicationService.restartProcess(
          principal.sessionGroupId,
          appConfigId,
          processConfigId,
          principal.organizationId,
          principal.userId,
          { actorType: "agent" },
        ),
      );
    }),
  );

  server.registerTool(
    "run_workspace_setup_script",
    {
      title: "Run a workspace setup script",
      description: "Run a configured setup script for this workspace and return whether it was started.",
      inputSchema: { scriptId: z.string().min(1) },
    },
    withErrors(async ({ scriptId }) => {
      await scopedGroup(principal);
      return result({
        started: await sessionApplicationService.runSetupScript(
          principal.sessionGroupId,
          scriptId,
          principal.organizationId,
          principal.userId,
          { actorType: "agent" },
        ),
      });
    }),
  );

  return server;
}

/**
 * The agent-facing MCP endpoint intentionally accepts only short-lived,
 * session-group-bound capabilities. It is not a general user OAuth endpoint.
 */
export function createAgentMcpRouter(): Router {
  const router = Router();
  router.post("/mcp", async (req, res) => {
    const token = bearer(req);
    const principal = token ? verifyAgentMcpToken(token) : null;
    if (!principal) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid agent MCP token" }, id: null });
      return;
    }

    const server = createServer(principal);
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
    } catch (error) {
      console.error("[agent-mcp] request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "MCP request failed" }, id: null });
      }
    }
  });
  router.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  return router;
}
