import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AGENT_INACTIVITY_TIMEOUT_MS,
  runStateByWorkspaceId,
  appendAgentDebugLog,
  startWatchdog,
  resetWatchdog,
  stopWatchdog,
} from "../watchdog";
import {
  runningProcesses,
  suppressSyntheticStopFor,
  ensureWorktree,
  getWorktreeBranch,
} from "../worktree";
import { runProcess } from "../process";
import { getAgent } from "./registry";
import type { SpawnConfig } from "../../types";
import type { InteractionMode, SystemPromptParts } from "./types";

function resolveServerUrl(): string {
  const raw = process.env.TRACE_SERVER_URL;
  if (!raw)
    return process.env.TRACE_PROD
      ? "https://trace-6kt7.onrender.com"
      : "http://localhost:3100";
  if (raw.startsWith("http")) return raw;
  return `http://localhost:${raw}`;
}
const SERVER_URL = resolveServerUrl();
const MAX_CAPTURE_CHARS = 20_000;

async function generateBranchName(
  prompt: string,
  workspaceId: string,
  branchPrefix?: string,
): Promise<string> {
  const prefix = branchPrefix || "trace";
  const fallback = `${prefix}/${workspaceId.slice(0, 8)}`;
  try {
    const res = await fetch(`${SERVER_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "query GenerateBranchName($prompt: String!) { generateBranchName(prompt: $prompt) }",
        variables: { prompt },
      }),
    });
    if (!res.ok) return fallback;
    const { data } = (await res.json()) as {
      data?: { generateBranchName: string | null };
    };
    if (!data?.generateBranchName) return fallback;
    return `${prefix}/${data.generateBranchName}`.slice(0, 50);
  } catch {
    return fallback;
  }
}

async function runSetupScripts(
  worktreePath: string,
  commands: string[],
): Promise<void> {
  const script = commands.join("\n");
  if (!script.trim()) return;
  const result = await runProcess(
    "sh",
    ["-c", `set -e\n${script}`],
    worktreePath,
  );
  if (result.code !== 0) {
    console.error(
      `[setup-script] script failed (exit ${result.code}):\n${result.stderr}`,
    );
  }
}

function buildTraceContext(worktreePath: string, config: SpawnConfig): string {
  return (
    `You are working inside Trace, a Mac app for running coding agents in parallel.\n` +
    `Your work takes place in ${worktreePath} which is an isolated git worktree created for this task.`
  );
}

export async function spawnAgent(config: SpawnConfig): Promise<string> {
  let {
    agentType,
    workspaceId,
    prompt,
    repoPath,
    creationCommands,
    resumeSessionId,
    filePaths,
    model,
    effort,
    systemInstructions,
    permissionMode,
    baseBranch,
    branchPrefix,
  } = config;

  const adapter = getAgent(agentType);
  const { worktreePath, created } = await ensureWorktree(
    workspaceId,
    repoPath,
    baseBranch,
    branchPrefix,
  );

  if (created && creationCommands && creationCommands.length > 0) {
    appendAgentDebugLog(
      workspaceId,
      `running ${creationCommands.length} setup script(s)`,
    );
    await runSetupScripts(worktreePath, creationCommands);
    appendAgentDebugLog(workspaceId, "setup scripts completed");
  }
  const startedAt = Date.now();
  appendAgentDebugLog(
    workspaceId,
    `spawn start agent=${agentType} cwd=${worktreePath} inactivityTimeoutMs=${AGENT_INACTIVITY_TIMEOUT_MS} promptLen=${prompt.length}`,
  );

  // Rename branch on first spawn (not resume)
  const prefix = branchPrefix || "trace";
  const defaultBranch = `${prefix}/${workspaceId.slice(0, 8)}`;
  const currentBranch = await getWorktreeBranch(workspaceId);
  if (!resumeSessionId && currentBranch === defaultBranch) {
    let newBranch = await generateBranchName(prompt, workspaceId, branchPrefix);
    if (newBranch !== defaultBranch) {
      let renameResult = await runProcess(
        "git",
        ["branch", "-m", newBranch],
        worktreePath,
      );
      if (renameResult.code !== 0) {
        newBranch = `${newBranch.slice(0, 44)}-${workspaceId.slice(0, 4)}`;
        renameResult = await runProcess(
          "git",
          ["branch", "-m", newBranch],
          worktreePath,
        );
      }
      if (renameResult.code === 0) {
        appendAgentDebugLog(workspaceId, `branch renamed to ${newBranch}`);
      } else {
        appendAgentDebugLog(
          workspaceId,
          `branch rename failed: ${renameResult.stderr.trim()}`,
        );
      }
    }
  }

  // Kill existing process for this workspace
  const existing = runningProcesses.get(workspaceId);
  if (existing && !existing.killed) {
    suppressSyntheticStopFor.add(workspaceId);
    stopWatchdog(workspaceId, "spawn-replaced");
    runStateByWorkspaceId.delete(workspaceId);
    existing.kill("SIGTERM");
    runningProcesses.delete(workspaceId);
  }

  // Download remote images to the worktree
  if (filePaths && filePaths.length > 0) {
    const resolvedPaths: string[] = [];
    const imgDir = path.join(worktreePath, ".trace-images");
    let imgDirCreated = false;
    for (const p of filePaths) {
      if (p.startsWith("http://") || p.startsWith("https://")) {
        try {
          if (!imgDirCreated) {
            fs.mkdirSync(imgDir, { recursive: true });
            imgDirCreated = true;
          }
          const filename = path.basename(new URL(p).pathname);
          const localPath = path.join(imgDir, filename);
          const response = await fetch(p);
          if (!response.ok) {
            appendAgentDebugLog(
              workspaceId,
              `image download failed status=${response.status} url=${p}`,
            );
            continue;
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(localPath, buffer);
          resolvedPaths.push(localPath);
        } catch (err) {
          appendAgentDebugLog(
            workspaceId,
            `image download error url=${p} error=${String(err)}`,
          );
        }
      } else {
        resolvedPaths.push(p);
      }
    }
    filePaths = resolvedPaths;
  }

  // Map permissionMode to interactionMode for adapter consumption
  const interactionMode =
    (permissionMode as InteractionMode | undefined) ?? "code";
  let finalPrompt = prompt;
  if (!resumeSessionId) {
    const parts: SystemPromptParts = {
      traceContext: buildTraceContext(worktreePath, config),
      systemInstructions,
      interactionMode: interactionMode,
      filePaths,
      hasMcpTools: !!(config.channelId),
    };
    const wrappedSystemPrompt = adapter.wrapSystemPrompt
      ? adapter.wrapSystemPrompt(parts)
      : [parts.traceContext, parts.systemInstructions]
          .filter(Boolean)
          .join("\n\n");
    finalPrompt = wrappedSystemPrompt + "\n\n" + prompt;
  }

  // Build the agent-specific command
  const cmd = await adapter.buildCommand({
    workspaceId,
    prompt: finalPrompt,
    worktreePath,
    interactionMode: interactionMode,
    model,
    effort,
    resumeSessionId,
    filePaths,
    channelId: config.channelId,
    serverUrl: SERVER_URL,
  });

  // Build env: apply envFilter if provided, otherwise pass full process.env
  const env = cmd.envFilter
    ? Object.fromEntries(
        Object.entries(process.env).filter(([k]) => cmd.envFilter!(k)),
      )
    : { ...process.env };

  const child = spawn(cmd.command, cmd.args, {
    cwd: worktreePath,
    stdio: [cmd.stdinMode, "pipe", "pipe"],
    env,
  });
  appendAgentDebugLog(
    workspaceId,
    `spawned ${agentType} pid=${child.pid ?? -1}`,
  );

  // Write stdin if needed (e.g. Codex receives prompt via stdin)
  if (cmd.stdin && child.stdin) {
    child.stdin.write(cmd.stdin);
    child.stdin.end();
  }

  runningProcesses.set(workspaceId, child);
  startWatchdog(workspaceId, child);

  const parser = adapter.createParser({
    serverUrl: SERVER_URL,
    workspaceId,
    cwd: worktreePath,
    callbacks: {
      onSessionId: (id) =>
        appendAgentDebugLog(workspaceId, `stream session_id=${id}`),
      onActivity: () => resetWatchdog(workspaceId, "stream-json"),
      onInputRequired: () => {
        appendAgentDebugLog(workspaceId, "input-required: killing process");
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      },
    },
    log: (line) => appendAgentDebugLog(workspaceId, line),
  });

  let stderrBuffer = "";
  let failedToSpawn: string | null = null;

  const appendToStderr = (existing: string, chunk: string) => {
    const combined = existing + chunk;
    return combined.length <= MAX_CAPTURE_CHARS
      ? combined
      : combined.slice(combined.length - MAX_CAPTURE_CHARS);
  };

  child.stdout?.on("data", (data) => {
    const chunk = data.toString();
    parser.processChunk(chunk);
    appendAgentDebugLog(
      workspaceId,
      `stdout bytes=${Buffer.byteLength(chunk)}`,
    );
  });

  child.stderr?.on("data", (data) => {
    const chunk = data.toString();
    stderrBuffer = appendToStderr(stderrBuffer, chunk);
    resetWatchdog(workspaceId, "stderr");
    appendAgentDebugLog(
      workspaceId,
      `stderr bytes=${Buffer.byteLength(chunk)} text=${chunk.trim().slice(0, 500)}`,
    );
    console.error(
      `[${agentType}:${workspaceId.slice(0, 8)}:err] ${chunk.trim()}`,
    );
  });

  child.on("error", (err) => {
    failedToSpawn = String(err);
    stopWatchdog(workspaceId, "spawn-error");
    appendAgentDebugLog(workspaceId, `spawn error=${failedToSpawn}`);
    console.error(
      `[${agentType}:${workspaceId.slice(0, 8)}:spawn] ${failedToSpawn}`,
    );
  });

  child.on("close", async (code) => {
    const tag = `[${agentType}:${workspaceId.slice(0, 8)}]`;
    appendAgentDebugLog(
      workspaceId,
      `close code=${code} durationMs=${Date.now() - startedAt} stderrLen=${stderrBuffer.length}`,
    );

    // Clean up temp MCP config file
    try {
      fs.unlinkSync(path.join(os.tmpdir(), `trace-mcp-${workspaceId}.json`));
    } catch {
      // File may not exist if MCP wasn't configured
    }
    // Only remove from the map if this process is still the registered one.
    // A replacement spawn may have already inserted a new child process, and
    // blindly deleting would remove the *new* entry.
    if (runningProcesses.get(workspaceId) === child) {
      runningProcesses.delete(workspaceId);
    }
    const runState = runStateByWorkspaceId.get(workspaceId);
    const timedOut = runState?.timedOut ?? false;
    const userStopped = runState?.userStopped ?? false;
    stopWatchdog(workspaceId, "process-close");
    runStateByWorkspaceId.delete(workspaceId);

    const suppressed = suppressSyntheticStopFor.delete(workspaceId);
    if (suppressed) return;

    try {
      parser.flush();
      await parser.waitForPendingPosts();
      const enrichment = parser.getEnrichment();
      const sessionId = enrichment.sessionId;

      if (!sessionId) {
        appendAgentDebugLog(
          workspaceId,
          `no session_id from stream (code=${code} stderrLen=${stderrBuffer.length})`,
        );
      }

      let branchName: string | undefined;
      try {
        const branchResult = await runProcess(
          "git",
          ["rev-parse", "--abbrev-ref", "HEAD"],
          worktreePath,
        );
        if (branchResult.code === 0 && branchResult.stdout.trim()) {
          branchName = branchResult.stdout.trim();
        }
      } catch {
        // Ignore branch resolution failures
      }

      const stderrOutput = stderrBuffer.trim();
      let stopReason: string | undefined;

      if (userStopped || code === 143) {
        stopReason = "user";
      }

      const includeStderr =
        !enrichment.lastAssistantText ||
        (code !== 0 && code !== null && code !== 143);

      const fallbackMessage = [
        enrichment.lastAssistantText,
        timedOut
          ? `Timed out after ${AGENT_INACTIVITY_TIMEOUT_MS}ms of inactivity.`
          : "",
        failedToSpawn ? `Spawn error: ${failedToSpawn}` : "",
        includeStderr ? stderrOutput : "",
        code !== 0 && code !== null && code !== 143
          ? `Process exited with code ${code}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      const messageToPersist =
        fallbackMessage ||
        (userStopped
          ? "Stopped by user"
          : `${agentType} run completed without textual output.`);

      const payload = {
        session_id: sessionId ?? `trace-local-${workspaceId}`,
        cwd: worktreePath,
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: messageToPersist,
        source: "stream-json",
        exit_code: code,
        ...(stopReason && { stop_reason: stopReason }),
        ...(enrichment.usage && { extracted_usage: enrichment.usage }),
        ...(enrichment.detectedToolName !== undefined && {
          extracted_tool_name: enrichment.detectedToolName,
        }),
        ...(enrichment.detectedToolInput !== undefined && {
          extracted_tool_input: enrichment.detectedToolInput,
        }),
        ...(branchName && { branch_name: branchName }),
        agent_type: agentType,
        input_required: enrichment.inputRequired,
        input_required_reason: enrichment.inputRequiredReason,
        run_metadata: {
          model,
          effort,
          agentType,
          interactionMode: interactionMode,
        },
      };

      appendAgentDebugLog(
        workspaceId,
        `stop payload session=${payload.session_id} branch=${branchName ?? "none"} tool=${enrichment.detectedToolName ?? "none"} msgLen=${messageToPersist.length}`,
      );

      const response = await fetch(`${SERVER_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      appendAgentDebugLog(
        workspaceId,
        `stop event posted status=${response.status} ok=${response.ok}`,
      );
    } catch (err) {
      console.error(`${tag} close handler error:`, err);
      appendAgentDebugLog(workspaceId, `close handler error=${String(err)}`);
    }
  });

  return worktreePath;
}
