import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import type { BridgeClient as IBridgeClient, BridgeCommand, BridgeMessage, CodingToolAdapter } from "@trace/shared";
import { parseBranchOutput } from "@trace/shared";
import { ClaudeCodeAdapter, CodexAdapter } from "@trace/shared/adapters";
import { readConfig, getOrCreateInstanceId } from "./config.js";
import { createWorktree, removeWorktree } from "./worktree.js";
import { runtimeDebug } from "./runtime-debug.js";
import { TerminalManager } from "@trace/shared/adapters";

const HEARTBEAT_INTERVAL_MS = 10_000;

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

export type BridgeConnectionStatus = "connecting" | "connected" | "disconnected";

export class BridgeClient implements IBridgeClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private adapters = new Map<string, CodingToolAdapter>();
  private sessionTools = new Map<string, string>();
  private reportedToolSessionIds = new Map<string, string>();
  private instanceId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private status: BridgeConnectionStatus = "disconnected";
  private statusListeners = new Set<(status: BridgeConnectionStatus) => void>();
  /** Maps sessionId → workdir so terminals can spawn in the correct directory */
  private sessionWorkdirs = new Map<string, string>();
  private terminalManager: TerminalManager;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.instanceId = getOrCreateInstanceId();
    this.terminalManager = new TerminalManager({
      onOutput: (terminalId, data) => {
        this.send({ type: "terminal_output", terminalId, data });
      },
      onExit: (terminalId, exitCode) => {
        this.send({ type: "terminal_exit", terminalId, exitCode });
      },
    });
  }

  connect() {
    this.setStatus("connecting");
    runtimeDebug("desktop bridge connecting", { serverUrl: this.serverUrl, instanceId: this.instanceId });
    this.ws = new WebSocket(`${this.serverUrl}/bridge`);

    this.ws.on("open", () => {
      console.log("[bridge] connected to server");
      runtimeDebug("desktop bridge websocket open", { instanceId: this.instanceId });
      this.setStatus("connected");
      this.sendRuntimeHello();
      this.startHeartbeat();
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeCommand;
        this.handleCommand(msg);
      } catch (err) {
        console.error("[bridge] failed to parse message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[bridge] disconnected, reconnecting in 3s...");
      this.stopHeartbeat();
      runtimeDebug("desktop bridge websocket closed", { instanceId: this.instanceId });
      this.setStatus("disconnected");
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err) => {
      console.error("[bridge] error:", err.message);
      runtimeDebug("desktop bridge websocket error", { instanceId: this.instanceId, error: err.message });
    });
  }

  send(data: BridgeMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.stopHeartbeat();
    this.terminalManager.destroyAll();
    for (const adapter of this.adapters.values()) {
      adapter.abort();
    }
    this.adapters.clear();
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  getStatus(): BridgeConnectionStatus {
    return this.status;
  }

  onStatusChange(listener: (status: BridgeConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private sendRuntimeHello() {
    // Announce identity — the server restores session bindings from the DB
    // using our stable instanceId, so we don't need to report session lists.
    const config = readConfig();
    runtimeDebug("desktop bridge sending runtime_hello", {
      instanceId: this.instanceId,
      label: os.hostname(),
      supportedTools: ["claude_code", "codex", "custom"],
      registeredRepoIds: Object.keys(config.repos),
    });
    this.send({
      type: "runtime_hello",
      instanceId: this.instanceId,
      label: os.hostname(),
      hostingMode: "local",
      supportedTools: ["claude_code", "codex", "custom"],
      registeredRepoIds: Object.keys(config.repos),
      activeTerminals: this.terminalManager.getActiveTerminals(),
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "runtime_heartbeat", instanceId: this.instanceId });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: BridgeConnectionStatus) {
    if (this.status === status) return;
    runtimeDebug("desktop bridge status changed", { instanceId: this.instanceId, from: this.status, to: status });
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    switch (tool) {
      case "codex":
        return new CodexAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private runPrompt({ sessionId, prompt, cwd, tool, model, interactionMode, toolSessionId }: { sessionId: string; prompt: string; cwd?: string; tool?: string; model?: string; interactionMode?: string; toolSessionId?: string }) {
    if (!cwd) {
      console.warn(`[bridge] No cwd provided for session ${sessionId}, falling back to home directory (${os.homedir()})`);
    }
    const workdir = cwd ?? os.homedir();

    // If tool changed, abort old adapter and create a fresh one
    const prevTool = this.sessionTools.get(sessionId);
    if (tool && prevTool && prevTool !== tool) {
      const oldAdapter = this.adapters.get(sessionId);
      if (oldAdapter) oldAdapter.abort();
      this.adapters.delete(sessionId);
    }

    // Reuse existing adapter (retains session state for --resume)
    let adapter = this.adapters.get(sessionId);
    if (!adapter) {
      adapter = this.createAdapter(tool);
      this.adapters.set(sessionId, adapter);
      this.send({ type: "register_session", sessionId });
    }
    if (tool) this.sessionTools.set(sessionId, tool);

    // Capture reference so stale callbacks from an aborted adapter
    // (e.g. after a tool switch) are silently dropped.
    const activeAdapter = adapter;
    adapter.run({
      prompt,
      cwd: workdir,
      onOutput: (output) => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_output", sessionId, data: output });
        // When the adapter discovers its tool session ID, report it to the server
        // so it can be passed back on retry/resume
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

  private handleCommand(cmd: BridgeCommand) {
    switch (cmd.type) {
      case "run": {
        this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt ?? "",
          cwd: cmd.cwd,
          tool: cmd.tool,
          model: cmd.model,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
        });
        break;
      }
      case "send": {
        this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt,
          cwd: cmd.cwd,
          tool: cmd.tool,
          model: cmd.model,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
        });
        break;
      }
      case "prepare": {
        const { sessionId, repoId, repoName, defaultBranch, branch } = cmd;

        const config = readConfig();
        const repoPath = config.repos[repoId];

        if (!repoPath) {
          this.send({
            type: "workspace_failed",
            sessionId,
            error: `No local path configured for repo "${repoName}" (${repoId}). Configure it in Settings.`,
          });
          break;
        }

        createWorktree({ repoPath, repoId, sessionId, defaultBranch, startBranch: branch })
          .then(({ workdir, branch: worktreeBranch }) => {
            this.sessionWorkdirs.set(sessionId, workdir);
            this.send({ type: "workspace_ready", sessionId, workdir, branch: worktreeBranch });
          })
          .catch((err: Error) => {
            this.send({ type: "workspace_failed", sessionId, error: err.message });
          });
        break;
      }
      case "terminate": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          // Abort the running process but keep the adapter so it retains
          // the Claude Code session ID for --resume on subsequent messages.
          adapter.abort();
        }
        break;
      }
      case "pause": {
        const pauseAdapter = this.adapters.get(cmd.sessionId);
        if (pauseAdapter) {
          pauseAdapter.abort();
        }
        break;
      }
      case "resume": {
        // Nothing to do — the adapter is kept and will be reused on next run/send
        break;
      }
      case "delete": {
        const deleteAdapter = this.adapters.get(cmd.sessionId);
        if (deleteAdapter) {
          deleteAdapter.abort();
          this.adapters.delete(cmd.sessionId);
        }
        this.sessionTools.delete(cmd.sessionId);
        this.reportedToolSessionIds.delete(cmd.sessionId);
        this.sessionWorkdirs.delete(cmd.sessionId);
        this.terminalManager.destroyForSession(cmd.sessionId);

        // Clean up worktree if one exists
        if (cmd.workdir && cmd.repoId) {
          const config = readConfig();
          const repoPath = config.repos[cmd.repoId];
          if (repoPath) {
            removeWorktree({ repoPath, worktreePath: cmd.workdir }).catch((err: Error) => {
              console.warn(`[bridge] failed to remove worktree ${cmd.workdir}:`, err.message);
            });
          }
        }
        break;
      }
      case "list_branches": {
        const { requestId, repoId } = cmd;
        const config = readConfig();
        const repoPath = config.repos[repoId];

        if (!repoPath) {
          this.send({ type: "branches_result", requestId, branches: [], error: "Repo not linked" });
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
        const { requestId, sessionId, workdirHint } = cmd;
        const workdir = this.sessionWorkdirs.get(sessionId) ?? workdirHint;
        if (!workdir) {
          this.send({ type: "files_result", requestId, files: [], error: `No workdir known for session ${sessionId}` });
          break;
        }
        execFile("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: workdir, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
          if (err) {
            walkDir(workdir, workdir, 6).then(
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
        const { requestId, sessionId, relativePath, workdirHint } = cmd;
        const workdir = this.sessionWorkdirs.get(sessionId) ?? workdirHint;
        if (!workdir) {
          this.send({ type: "file_content_result", requestId, content: "", error: `No workdir known for session ${sessionId}` });
          break;
        }
        const fullPath = path.join(workdir, relativePath);
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
}
