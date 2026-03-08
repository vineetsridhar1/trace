import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../process";
import { getAuthToken } from "../instanceConnection";
import { ClaudeStreamParser } from "./claudeParser";
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentCommand,
  AgentDetectResult,
  AgentSpawnContext,
  AgentStreamParser,
  StreamParserOpts,
  SystemPromptParts,
} from "./types";

let effortSupportedPromise: Promise<boolean> | null = null;

async function detectEffortSupport(): Promise<boolean> {
  try {
    const result = await runProcess("claude", ["--help"], "/");
    return (result.stdout + result.stderr).includes("--effort");
  } catch {
    return false;
  }
}

function isEffortSupported(): Promise<boolean> {
  if (!effortSupportedPromise) {
    effortSupportedPromise = detectEffortSupport();
  }
  return effortSupportedPromise;
}

export class ClaudeAdapter implements AgentAdapter {
  readonly type = "claude" as const;

  private static readonly EFFORT_OPTIONS = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ];

  readonly capabilities: AgentCapabilities = {
    displayName: "Claude Code",
    supportsResume: true,
    supportsPlanMode: true,
    models: [
      {
        value: "opus",
        label: "Opus 4.6",
        effortOptions: ClaudeAdapter.EFFORT_OPTIONS,
      },
      {
        value: "sonnet",
        label: "Sonnet 4.6",
        effortOptions: ClaudeAdapter.EFFORT_OPTIONS,
      },
      { value: "haiku", label: "Haiku 4.5" },
    ],
    defaultModel: "opus",
    effortLabel: "Effort",
  };

  async detect(): Promise<AgentDetectResult> {
    try {
      const result = await runProcess("claude", ["--version"], "/");
      if (result.code !== 0) {
        return {
          available: false,
          error: "claude CLI not found",
          installHint:
            "Install from https://docs.anthropic.com/en/docs/claude-code",
        };
      }
      const version = result.stdout.trim();

      // Check auth status
      let authStatus: "ok" | "missing" = "ok";
      let authHint: string | undefined;
      try {
        const authResult = await runProcess("claude", ["auth", "status"], "/");
        if (authResult.code !== 0) {
          authStatus = "missing";
          authHint = "Run: claude auth login";
        }
      } catch {
        authStatus = "missing";
        authHint = "Run: claude auth login";
      }

      return {
        available: true,
        version,
        authStatus,
        authHint: authStatus === "missing" ? authHint : undefined,
        installHint:
          "Install from https://docs.anthropic.com/en/docs/claude-code",
      };
    } catch {
      return {
        available: false,
        error: "claude CLI not found",
        installHint:
          "Install from https://docs.anthropic.com/en/docs/claude-code",
      };
    }
  }

  async buildCommand(ctx: AgentSpawnContext): Promise<AgentCommand> {
    const args =
      ctx.interactionMode === "plan"
        ? ["--permission-mode", "plan"]
        : ["--dangerously-skip-permissions"];

    if (ctx.resumeSessionId) {
      args.push("--resume", ctx.resumeSessionId);
    }

    if (ctx.model) {
      args.push("--model", ctx.model);
    }

    const modelDef = this.capabilities.models.find(
      (m) => m.value === ctx.model,
    );
    if (ctx.effort && modelDef?.effortOptions && (await isEffortSupported())) {
      args.push("--effort", ctx.effort);
    }

    // Write MCP config for Trace tools if channelId is available
    if (ctx.channelId && ctx.serverUrl) {
      const mcpConfigPath = path.join(
        os.tmpdir(),
        `trace-mcp-${ctx.workspaceId}.json`,
      );
      const authToken = getAuthToken();
      const env: Record<string, string> = {
        TRACE_SERVER_URL: ctx.serverUrl,
        TRACE_CHANNEL_ID: ctx.channelId,
        TRACE_WORKSPACE_ID: ctx.workspaceId,
        TRACE_MODEL: ctx.model ?? "opus",
        TRACE_EFFORT: ctx.effort ?? "high",
        ...(ctx.channelName && { TRACE_CHANNEL_NAME: ctx.channelName }),
      };
      if (authToken) {
        env.TRACE_AUTH_TOKEN = authToken;
      }
      const mcpConfig = {
        mcpServers: {
          trace: {
            command: "node",
            args: [path.join(__dirname, "traceServer.js")],
            env,
          },
        },
      };
      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), { mode: 0o600 });
      args.push("--mcp-config", mcpConfigPath);
    }

    args.push("--output-format", "stream-json", "--verbose");
    args.push("-p", ctx.prompt);

    return {
      command: "claude",
      args,
      stdinMode: "ignore",
      envFilter: (key: string) => key !== "CLAUDECODE",
    };
  }

  wrapSystemPrompt(parts: SystemPromptParts): string {
    const sections: string[] = [];

    sections.push(parts.traceContext);

    if (parts.systemInstructions) {
      sections.push(parts.systemInstructions);
    }

    if (parts.filePaths && parts.filePaths.length > 0) {
      const fileList = parts.filePaths.map((p) => `- ${p}`).join("\n");
      sections.push(
        `The user has referenced the following files. Read them to understand the context:\n${fileList}`,
      );
    }

    if (parts.interactionMode === "ask") {
      sections.push(
        "Do NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.",
      );
    }

    if (parts.interactionMode === "plan") {
      sections.push(
        "Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.",
      );
    }

    if (parts.hasMcpTools) {
      sections.push(
        `You have access to Trace workspace tools via MCP. Use these to coordinate with other workspaces:
- list_tickets: See all tickets and their statuses on the project board. Filter by channel name, column, or status.
- get_thread: Read the conversation thread for any workspace (defaults to yours). Use this to understand what another workspace has done.
- get_ticket_status: Check the current status of a specific workspace.
- create_ticket: Spin off independent sub-tasks into parallel workspaces. You can choose the interaction mode (code/plan/ask). Only do this for genuinely independent work, not for small sub-steps.
- write_to_ticket: Send a follow-up message to another workspace and trigger the agent to run on it. By default this resumes the existing Claude session. You can set trigger_run=false to just leave a note, or choose an interaction mode (code/plan/ask).

Interaction modes: "code" allows full code changes (default), "plan" creates a plan for review before implementing, "ask" is read-only analysis only.${parts.channelName ? `\n\nYou are currently working in channel: "${parts.channelName}". Use this to filter list_tickets to your own channel.` : ""}`,
      );
    }

    return `<trace-internal>\n${sections.join("\n\n")}\n</trace-internal>`;
  }

  createParser(opts: StreamParserOpts): AgentStreamParser {
    return new ClaudeStreamParser(opts);
  }
}
