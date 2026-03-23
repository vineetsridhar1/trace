import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import type { BridgeClient as IBridgeClient, BridgeCommand, BridgeMessage, CodingToolAdapter } from "@trace/shared";
import { parseBranchOutput } from "@trace/shared";
import { ClaudeCodeAdapter, CodexAdapter } from "@trace/shared/adapters";
import { ensureRepo, createWorktree, removeWorktree, getRepoPath } from "./workspace.js";
import { ensureToolReady } from "./tool-auth.js";
import { TerminalManager } from "@trace/shared/adapters";

const WALK_IGNORE = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", ".venv", "vendor", ".cache", "coverage"]);

async function walkDir(root: string, dir: string, maxDepth: number): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    if (WALK_IGNORE.has(entry.name) || entry.name.startsWith(".DS_Store")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkDir(root, full, maxDepth - 1);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(path.relative(root, full));
    }
  }
  return results;
}

/**
 * Multi-session container bridge — runs inside a Fly Machine (one per user per org).
 * Mirrors the desktop BridgeClient pattern: Map-based adapters, dynamic session binding.
 * Handles prepare/delete commands for repo cloning and worktree management.
 */
export class ContainerBridge implements IBridgeClient {
  private ws: WebSocket | null = null;
  private adapters = new Map<string, CodingToolAdapter>();
  private sessionTools = new Map<string, string>();
  private reportedToolSessionIds = new Map<string, string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  /** Max consecutive connection failures before the process exits, allowing the machine to stop. */
  private static MAX_RECONNECT_FAILURES = 20;
  private sessionWorkdirs = new Map<string, string>();
  private terminalManager: TerminalManager;
  private lastActivity = Date.now();
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  /** Exit if no sessions/terminals have been active for this long. */
  private static IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly machineId: string,
    private readonly defaultTool: string,
  ) {
    this.terminalManager = new TerminalManager({
      onOutput: (terminalId, data) => {
        this.send({ type: "terminal_output", terminalId, data });
      },
      onExit: (terminalId, exitCode) => {
        this.send({ type: "terminal_exit", terminalId, exitCode });
      },
    });
  }

  connect(): void {
    const url = `${this.serverUrl}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[container-bridge] connected to server");
      this.consecutiveFailures = 0;
      // Announce as a cloud runtime — machineId is the stable instanceId
      this.send({
        type: "runtime_hello",
        instanceId: `cloud-machine-${this.machineId}`,
        label: `cloud-machine-${this.machineId}`,
        hostingMode: "cloud",
        supportedTools: ["claude_code", "codex"],
        registeredRepoIds: [], // Cloud bridges clone on-demand — all repos supported
        activeTerminals: this.terminalManager.getActiveTerminals(),
      });

      this.startHeartbeat();
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeCommand;
        this.handleCommand(msg);
      } catch (err) {
        console.error("[container-bridge] error parsing message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[container-bridge] disconnected");
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[container-bridge] error:", err.message);
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.terminalManager.destroyAll();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const adapter of this.adapters.values()) {
      adapter.abort();
    }
    this.adapters.clear();
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(data: BridgeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= ContainerBridge.MAX_RECONNECT_FAILURES) {
      console.error(
        `[container-bridge] ${this.consecutiveFailures} consecutive connection failures, exiting`,
      );
      process.exit(1);
    }

    // Exponential backoff: 3s, 6s, 12s, ... capped at 30s
    const delay = Math.min(3000 * 2 ** (this.consecutiveFailures - 1), 30_000);
    console.log(`[container-bridge] reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.consecutiveFailures}/${ContainerBridge.MAX_RECONNECT_FAILURES})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private touchActivity(): void {
    this.lastActivity = Date.now();
  }

  /** Returns true if there are active sessions or terminals. */
  private hasActiveWork(): boolean {
    return this.adapters.size > 0 || this.terminalManager.hasTerminals();
  }

  startIdleWatch(): void {
    if (this.idleCheckTimer) return;
    this.idleCheckTimer = setInterval(() => {
      if (this.hasActiveWork()) {
        this.lastActivity = Date.now();
        return;
      }
      const idleMs = Date.now() - this.lastActivity;
      if (idleMs >= ContainerBridge.IDLE_TIMEOUT_MS) {
        console.log(`[container-bridge] idle for ${Math.round(idleMs / 1000)}s with no active work, exiting`);
        this.disconnect();
        process.exit(0);
      }
    }, 60_000); // Check every minute
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "runtime_heartbeat", instanceId: `cloud-machine-${this.machineId}` });
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    const resolvedTool = tool ?? this.defaultTool;
    switch (resolvedTool) {
      case "codex":
        return new CodexAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private handleCommand(cmd: BridgeCommand): void {
    this.touchActivity();
    switch (cmd.type) {
      case "run":
      case "send": {
        this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt ?? "",
          cwd: cmd.cwd ?? os.homedir(),
          tool: cmd.tool,
          model: cmd.model,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
        }).catch((err) => {
          console.error(`[container-bridge] runPrompt failed for ${cmd.sessionId}:`, err);
          this.send({ type: "session_output", sessionId: cmd.sessionId, data: { type: "error", message: err instanceof Error ? err.message : String(err) } });
          this.send({ type: "session_complete", sessionId: cmd.sessionId });
        });
        break;
      }

      case "prepare": {
        const { sessionId, repoId, repoRemoteUrl, defaultBranch, branch } = cmd;

        // Ensure repo is cloned, then create worktree for this session
        (async () => {
          try {
            await ensureRepo(repoId, repoRemoteUrl);
            const { workdir } = await createWorktree(repoId, sessionId, defaultBranch, branch);
            this.sessionWorkdirs.set(sessionId, workdir);
            // Register this session with the server
            this.send({ type: "register_session", sessionId });
            this.send({ type: "workspace_ready", sessionId, workdir });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[container-bridge] workspace failed for ${sessionId}:`, message);
            this.send({ type: "workspace_failed", sessionId, error: message });
          }
        })();
        break;
      }

      case "terminate": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) adapter.abort();
        break;
      }

      case "pause": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) adapter.abort();
        break;
      }

      case "resume": {
        // Nothing to do — adapter reused on next run/send
        break;
      }

      case "delete": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          adapter.abort();
          this.adapters.delete(cmd.sessionId);
        }
        this.sessionTools.delete(cmd.sessionId);
        this.reportedToolSessionIds.delete(cmd.sessionId);
        this.sessionWorkdirs.delete(cmd.sessionId);
        this.terminalManager.destroyForSession(cmd.sessionId);

        // Clean up worktree for this session only — keep the machine and bare repo
        if (cmd.workdir && cmd.repoId) {
          removeWorktree(cmd.repoId, cmd.workdir).catch((err: Error) => {
            console.warn(`[container-bridge] failed to remove worktree ${cmd.workdir}:`, err.message);
          });
        }
        break;
      }

      case "list_branches": {
        const { requestId, repoId } = cmd;
        const repoPath = getRepoPath(repoId);

        if (!repoPath) {
          this.send({ type: "branches_result", requestId, branches: [], error: "Repo not cloned" });
          break;
        }

        execFile("git", ["branch", "-a", "--format=%(refname:short)"], { cwd: repoPath }, (err, stdout) => {
          if (err) {
            this.send({ type: "branches_result", requestId, branches: [], error: err.message });
            return;
          }
          this.send({ type: "branches_result", requestId, branches: parseBranchOutput(stdout) });
        });
        break;
      }

      case "list_files": {
        const { requestId, workdir } = cmd;
        // Resolve effective workdir — fall back to known session workdir if sent path doesn't exist
        let effectiveDir = workdir;
        try {
          fs.accessSync(effectiveDir);
        } catch {
          const knownDir = [...this.sessionWorkdirs.values()][0];
          if (knownDir) {
            effectiveDir = knownDir;
          } else {
            this.send({ type: "files_result", requestId, files: [], error: `Working directory not found: ${workdir}` });
            break;
          }
        }
        // Try git ls-files first for tracked files, fall back to fs walk
        execFile("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: effectiveDir, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
          if (err) {
            walkDir(effectiveDir, effectiveDir, 6).then(
              (files) => this.send({ type: "files_result", requestId, files }),
              (walkErr) => this.send({ type: "files_result", requestId, files: [], error: walkErr.message }),
            );
            return;
          }
          const files = stdout.split("\n").filter(Boolean);
          this.send({ type: "files_result", requestId, files });
        });
        break;
      }

      case "read_file": {
        const { requestId, workdir: sentWorkdir, relativePath } = cmd;
        // Resolve workdir — fall back to known session workdir if sent path doesn't exist
        let resolvedDir = sentWorkdir;
        try {
          fs.accessSync(resolvedDir);
        } catch {
          const knownDir = [...this.sessionWorkdirs.values()][0];
          if (knownDir) {
            resolvedDir = knownDir;
          } else {
            this.send({ type: "file_content_result", requestId, content: "", error: `Working directory not found: ${sentWorkdir}` });
            break;
          }
        }
        const fullPath = path.join(resolvedDir, relativePath);
        fs.readFile(fullPath, "utf-8", (err, content) => {
          if (err) {
            this.send({ type: "file_content_result", requestId, content: "", error: err.message });
            return;
          }
          this.send({ type: "file_content_result", requestId, content });
        });
        break;
      }

      case "terminal_create": {
        const { terminalId, sessionId, cols, rows, cwd } = cmd;
        const workdir = cwd || this.sessionWorkdirs.get(sessionId) || os.homedir();
        try {
          this.terminalManager.create(terminalId, sessionId, workdir, cols, rows);
          this.send({ type: "terminal_ready", terminalId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.send({ type: "terminal_error", terminalId, error: message });
        }
        break;
      }
      case "terminal_input": {
        this.terminalManager.write(cmd.terminalId, cmd.data);
        break;
      }
      case "terminal_resize": {
        this.terminalManager.resize(cmd.terminalId, cmd.cols, cmd.rows);
        break;
      }
      case "terminal_destroy": {
        this.terminalManager.destroy(cmd.terminalId);
        break;
      }
    }
  }

  private async runPrompt({ sessionId, prompt, cwd, tool, model, interactionMode, toolSessionId }: {
    sessionId: string;
    prompt: string;
    cwd: string;
    tool?: string;
    model?: string;
    interactionMode?: string;
    toolSessionId?: string;
  }): Promise<void> {
    const resolvedTool = tool ?? this.defaultTool;
    await ensureToolReady(resolvedTool);

    // If tool changed, abort old adapter and create a fresh one
    const prevTool = this.sessionTools.get(sessionId);
    if (resolvedTool && prevTool && prevTool !== resolvedTool) {
      const oldAdapter = this.adapters.get(sessionId);
      if (oldAdapter) oldAdapter.abort();
      this.adapters.delete(sessionId);
    }

    // Reuse existing adapter for session continuity (--resume)
    let adapter = this.adapters.get(sessionId);
    if (!adapter) {
      adapter = this.createAdapter(resolvedTool);
      this.adapters.set(sessionId, adapter);
      this.send({ type: "register_session", sessionId });
    }
    this.sessionTools.set(sessionId, resolvedTool);

    const activeAdapter = adapter;
    adapter.run({
      prompt,
      cwd,
      onOutput: (output) => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_output", sessionId, data: output });
        if (adapter.getSessionId) {
          const sid = adapter.getSessionId();
          if (sid && sid !== this.reportedToolSessionIds.get(sessionId)) {
            this.reportedToolSessionIds.set(sessionId, sid);
            this.send({ type: "tool_session_id", sessionId, toolSessionId: sid });
          }
        }
      },
      onComplete: () => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_complete", sessionId });
      },
      interactionMode: interactionMode as "code" | "plan" | "ask" | undefined,
      model,
      toolSessionId,
    });
  }
}
