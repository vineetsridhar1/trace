import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../process";
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
      const mcpConfig = {
        mcpServers: {
          trace: {
            command: "node",
            args: [path.join(__dirname, "traceServer.js")],
            env: {
              TRACE_SERVER_URL: ctx.serverUrl,
              TRACE_CHANNEL_ID: ctx.channelId,
              TRACE_WORKSPACE_ID: ctx.workspaceId,
              TRACE_MODEL: ctx.model || "opus",
              TRACE_EFFORT: ctx.effort || "high",
            },
          },
        },
      };
      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
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
        `## Trace Workspace Management\n\n` +
        `You have MCP tools to manage workspaces in Trace:\n\n` +
        `- \`create_ticket\`: Create a new ticket/workspace for a sub-task. Use when you identify work that should run independently or in parallel. Set \`depends_on_current=true\` to queue it until your workspace merges.\n` +
        `- \`list_tickets\`: List current tickets in the channel to see what's already being worked on.\n` +
        `- \`get_ticket_status\`: Check a specific workspace's status.\n\n` +
        `Use these when:\n` +
        `- A task is large enough to benefit from parallel workstreams\n` +
        `- You identify an independent sub-task (different files/features)\n` +
        `- You want to queue follow-up work\n\n` +
        `Do NOT create tickets for small sub-steps of your current task.`,
      );
    }

    return `<trace-internal>\n${sections.join("\n\n")}\n</trace-internal>`;
  }

  createParser(opts: StreamParserOpts): AgentStreamParser {
    return new ClaudeStreamParser(opts);
  }
}
