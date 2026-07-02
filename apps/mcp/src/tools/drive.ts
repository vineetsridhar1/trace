import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TraceApi } from "../api.js";
import { jsonResult, run, CODING_TOOLS, SESSION_CORE_FIELDS } from "./util.js";

const SESSION_RESULT = SESSION_CORE_FIELDS;

export function registerDriveTools(server: McpServer, client: TraceApi): void {
  server.registerTool(
    "start_session",
    {
      title: "Start a session",
      description:
        "Start a new AI coding session. Provide a prompt plus where it should run: a channelId, or a repoId (+ optional branch), or an existing sessionGroupId. Defaults to the org/user defaults when tool/model are omitted.",
      inputSchema: {
        prompt: z.string().describe("Initial prompt / task for the coding agent."),
        tool: z
          .enum(CODING_TOOLS)
          .optional()
          .describe("Coding tool to run. Defaults to the user's default."),
        model: z.string().optional(),
        reasoningEffort: z.string().optional(),
        hosting: z.enum(["cloud", "local"]).optional().describe("Where the session runs."),
        repoId: z.string().optional(),
        branch: z.string().optional().describe("Base branch to start from."),
        channelId: z.string().optional(),
        sessionGroupId: z.string().optional().describe("Add the session to an existing group."),
        ticketId: z.string().optional(),
        projectId: z.string().optional(),
        interactionMode: z.string().optional(),
      },
    },
    async (args) =>
      run(async () => {
        const defaultChannelId = client.getDefaultChannelId();
        const input = {
          ...args,
          ...(!args.channelId && !args.repoId && !args.sessionGroupId && defaultChannelId
            ? { channelId: defaultChannelId }
            : {}),
        };
        const data = await client.request<{ startSession: unknown }>(
          `mutation ($input: StartSessionInput!) { startSession(input: $input) { ${SESSION_RESULT} } }`,
          { input },
        );
        return jsonResult(data.startSession);
      }),
  );

  server.registerTool(
    "run_session",
    {
      title: "Run / resume a session",
      description:
        "Kick off (or resume) execution on an existing session, optionally with a new prompt.",
      inputSchema: {
        id: z.string().describe("Session id."),
        prompt: z.string().optional().describe("Prompt to run with."),
        interactionMode: z.string().optional(),
      },
    },
    async ({ id, prompt, interactionMode }) =>
      run(async () => {
        const data = await client.request<{ runSession: unknown }>(
          `mutation ($id: ID!, $prompt: String, $interactionMode: String) {
            runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) { ${SESSION_RESULT} }
          }`,
          { id, prompt, interactionMode },
        );
        return jsonResult(data.runSession);
      }),
  );

  server.registerTool(
    "send_session_message",
    {
      title: "Send a message to a session",
      description:
        "Send a message into a running session (e.g. to steer or answer a question). Returns the created event.",
      inputSchema: {
        sessionId: z.string().describe("Session id."),
        text: z.string().describe("Message text."),
        interactionMode: z.string().optional(),
      },
    },
    async ({ sessionId, text, interactionMode }) =>
      run(async () => {
        const data = await client.request<{ sendSessionMessage: unknown }>(
          `mutation ($sessionId: ID!, $text: String!, $interactionMode: String) {
            sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {
              id eventType timestamp
            }
          }`,
          { sessionId, text, interactionMode },
        );
        return jsonResult(data.sendSessionMessage);
      }),
  );

  server.registerTool(
    "queue_session_message",
    {
      title: "Queue a message for a session",
      description:
        "Queue a message to be delivered to the session after its current turn. Returns the queued message.",
      inputSchema: {
        sessionId: z.string().describe("Session id."),
        text: z.string().describe("Message text."),
        interactionMode: z.string().optional(),
      },
    },
    async ({ sessionId, text, interactionMode }) =>
      run(async () => {
        const data = await client.request<{ queueSessionMessage: unknown }>(
          `mutation ($sessionId: ID!, $text: String!, $interactionMode: String) {
            queueSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {
              id text position createdAt
            }
          }`,
          { sessionId, text, interactionMode },
        );
        return jsonResult(data.queueSessionMessage);
      }),
  );

  server.registerTool(
    "fork_session",
    {
      title: "Fork a session from an event",
      description:
        "Create a new session forked from a specific point (event) in an existing session's timeline.",
      inputSchema: { eventId: z.string().describe("Event id to fork from (from session_timeline).") },
    },
    async ({ eventId }) =>
      run(async () => {
        const data = await client.request<{ forkSession: unknown }>(
          `mutation ($eventId: ID!) { forkSession(eventId: $eventId) { ${SESSION_RESULT} } }`,
          { eventId },
        );
        return jsonResult(data.forkSession);
      }),
  );

  server.registerTool(
    "terminate_session",
    {
      title: "Terminate a session",
      description: "Stop a running session. The session record is preserved.",
      inputSchema: { id: z.string().describe("Session id.") },
    },
    async ({ id }) =>
      run(async () => {
        const data = await client.request<{ terminateSession: unknown }>(
          `mutation ($id: ID!) { terminateSession(id: $id) { id agentStatus sessionStatus } }`,
          { id },
        );
        return jsonResult(data.terminateSession);
      }),
  );
}
