import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import crypto from "crypto";
import { promisify } from "util";
import type {
  BridgeClient as IBridgeClient,
  BridgeCommand,
  BridgeMessage,
  BridgePrObservation,
  BridgeRunCommand,
  BridgeSendCommand,
  CodingToolAdapter,
  ToolOutput,
} from "@trace/shared";
import {
  parseBranchOutput,
  handleListFiles,
  handleReadFile,
  handleWriteFile,
  handleCommitFileChanges,
  handleWorktreeChanges,
  handleRevertWorktreeFile,
  handleBranchDiff,
  handleFileAtRef,
  handleListSkills,
  downloadAttachmentsToTempFiles,
  cleanupTempAttachments,
  isMissingToolSessionError,
  inspectSessionCurrentBranch,
  inspectSessionGitSyncStatus,
  BridgeOutbox,
  BRIDGE_PROTOCOL_VERSION,
  actionRequiredArtifactForToolError,
  resolveBridgeWorkdir,
} from "@trace/shared";
import { buildTraceInvocationEnv } from "@trace/shared/trace-invocation-env";
import { ensureTraceRuntime } from "@trace/shared/trace-runtime";
import type { GitExecFn } from "@trace/shared";
import { getUsedSlugs } from "@trace/shared/animal-names";
import {
  AntigravityAdapter,
  ClaudeCodeAdapter,
  CodexAdapter,
  CursorComposerAdapter,
  PiAdapter,
  resolveExecutable,
} from "@trace/shared/adapters";
import { getBridgeLabel, getOrCreateInstanceId, getRepoConfig, readConfig } from "./config.js";
import {
  commitLinkedCheckoutChanges,
  getLinkedCheckoutChangedFile,
  getLinkedCheckoutStatus,
  linkLinkedCheckoutRepo,
  restoreLinkedCheckout,
  setAutoSyncManager,
  setLinkedCheckoutAutoSync,
  syncLinkedCheckout,
} from "./linked-checkout.js";
import { LinkedCheckoutAutoSyncManager } from "./linked-checkout-auto-sync.js";
import {
  createWorktree,
  removeWorktree,
  adoptWorktree,
  listRepoWorktrees,
  isTraceManagedWorktreePath,
  type CreatedWorktree,
} from "./worktree.js";
import { runtimeDebug } from "./runtime-debug.js";
import { TerminalManager } from "@trace/shared/adapters";
import { collectTrackedPrWorkspaces, type TrackedSessionWorkspace } from "./pr-tracking.js";

const BRIDGE_USER_AGENT = "Trace-Desktop-Bridge/0.1";
const HEARTBEAT_INTERVAL_MS = 10_000;
const LINKED_CHECKOUT_AUTO_SYNC_INTERVAL_MS = 15_000;
const LOCAL_PR_POLL_INTERVAL_MS = 60_000;
const LOCAL_PR_POLL_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFile);

export type GithubCliStatus = {
  installed: boolean;
  authenticated: boolean;
  error: string | null;
};

// Once a tool is detected we keep reporting it: the probe runs on every
// reconnect, and a transient timeout under load must never demote a tool that
// is actually installed (which would leave existing sessions unable to send
// messages until the app is reloaded).
const detectedExecutables = new Set<string>();

function hasExecutable(command: string): boolean {
  if (detectedExecutables.has(command)) return true;
  // Resolve against PATH + common install dirs instead of executing the binary:
  // GUI-launched processes often have a narrower PATH than the user's shell, and
  // executing `--version` is fragile (slow cold starts, non-interactive hangs).
  if (resolveExecutable(command) !== null) {
    detectedExecutables.add(command);
    return true;
  }
  return false;
}

function emptyLinkedCheckoutStatus(repoId: string) {
  return {
    repoId,
    repoPath: null,
    isAttached: false,
    attachedSessionGroupId: null,
    targetBranch: null,
    autoSyncEnabled: false,
    currentBranch: null,
    currentCommitSha: null,
    lastSyncedCommitSha: null,
    lastSyncError: null,
    restoreBranch: null,
    restoreCommitSha: null,
    hasUncommittedChanges: false,
    changedFiles: [],
    changedFilesTotalCount: 0,
    changedFilesTruncated: false,
  };
}

async function buildLinkedCheckoutFailureResult(repoId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = await getLinkedCheckoutStatus(repoId).catch(() =>
    emptyLinkedCheckoutStatus(repoId),
  );
  return {
    ok: false,
    status,
    error: message,
    errorCode: null,
  };
}

type ExecFileError = Error & {
  stderr?: string;
  stdout?: string;
};

async function maybeReadGitRef(repoPath: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoPath,
      maxBuffer: 1024 * 1024,
    });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function extractExecErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const execError = error as ExecFileError;
    return (
      execError.stderr?.trim() ||
      execError.stdout?.trim() ||
      execError.message.trim() ||
      String(error)
    );
  }
  return String(error);
}

function isNoPullRequestError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no pull requests found for branch") ||
    normalized.includes("no pull requests found for this branch")
  );
}

export async function getGithubCliStatus(): Promise<GithubCliStatus> {
  if (!hasExecutable("gh")) {
    return {
      installed: false,
      authenticated: false,
      error: "GitHub CLI (gh) is not installed.",
    };
  }

  try {
    await execFileAsync("gh", ["auth", "status", "--hostname", "github.com"], {
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: "1",
      },
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
    });
    return {
      installed: true,
      authenticated: true,
      error: null,
    };
  } catch (error) {
    return {
      installed: true,
      authenticated: false,
      error: extractExecErrorMessage(error),
    };
  }
}

export async function getGithubAuthToken(): Promise<string> {
  if (!hasExecutable("gh")) {
    throw new Error("GitHub CLI (gh) is not installed.");
  }

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token", "--hostname", "github.com"], {
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: "1",
      },
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
    });
    const token = stdout.trim();
    if (!token) {
      throw new Error("GitHub CLI returned an empty token.");
    }
    return token;
  } catch (error) {
    throw new Error(extractExecErrorMessage(error), { cause: error });
  }
}

async function inspectLocalPrStatus(workdir: string): Promise<{
  branch: string | null;
  pr: BridgePrObservation | null;
}> {
  const branch = await maybeReadGitRef(workdir, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (!branch || !hasExecutable("gh")) {
    return { branch, pr: null };
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("gh", ["pr", "view", "--json", "url,state"], {
      cwd: workdir,
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: "1",
      },
      maxBuffer: 1024 * 1024,
      timeout: LOCAL_PR_POLL_TIMEOUT_MS,
    }));
  } catch (error) {
    const message = extractExecErrorMessage(error);
    if (isNoPullRequestError(message)) {
      return { branch, pr: null };
    }
    throw new Error(message, { cause: error });
  }

  const parsed = JSON.parse(stdout) as {
    url?: unknown;
    state?: unknown;
  };

  if (!parsed || typeof parsed.url !== "string") {
    return { branch, pr: null };
  }

  if (parsed.state !== "OPEN" && parsed.state !== "CLOSED" && parsed.state !== "MERGED") {
    return { branch, pr: null };
  }

  return {
    branch,
    pr: {
      url: parsed.url,
      state: parsed.state,
      merged: parsed.state === "MERGED",
    },
  };
}

function isPendingInputOutput(output: ToolOutput): boolean {
  return (
    output.type === "assistant" &&
    output.message.content.some((block) => block.type === "question" || block.type === "plan")
  );
}

function getPendingInputToolUseId(output: ToolOutput): string | null {
  if (output.type !== "assistant") return null;
  for (const block of output.message.content) {
    if (
      (block.type === "question" || block.type === "plan") &&
      typeof block.toolUseId === "string"
    ) {
      return block.toolUseId;
    }
  }
  return null;
}

function actionableErrorMessage(output: ToolOutput): string | undefined {
  if (output.type === "error") return output.message;
  if (output.type !== "assistant") return undefined;
  const text = output.message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
  return text || undefined;
}

export type BridgeConnectionStatus = "connecting" | "connected" | "disconnected";

type BridgeAuthContext = {
  organizationId: string;
};

export class BridgeClient implements IBridgeClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private localPrPollingEnabled = false;
  private adapters = new Map<string, CodingToolAdapter>();
  private sessionTools = new Map<string, string>();
  private reportedToolSessionIds = new Map<string, string>();
  private instanceId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private localPrPollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isPollingLocalPrs = false;
  private status: BridgeConnectionStatus = "disconnected";
  private statusListeners = new Set<(status: BridgeConnectionStatus) => void>();
  private authContext: BridgeAuthContext | null = null;
  private bridgeAuthToken: { token: string; expiresAt: number } | null = null;
  private connectAttempt = 0;
  /** Maps sessionId → workdir so terminals can spawn in the correct directory */
  private sessionWorkdirs = new Map<string, string>();
  private sessionGroupIds = new Map<string, string | null>();
  /** Coalesces concurrent createWorktree calls for the same worktree key (sessionGroupId or sessionId) */
  private pendingWorktrees = new Map<string, Promise<CreatedWorktree>>();
  /** In-flight workspace prep per session, so prompts can wait for it to finish */
  private sessionPrepares = new Map<string, Promise<void>>();
  /** Fences late completions from superseded prepare commands. */
  private workspacePrepareVersions = new Map<string, number>();
  private nextWorkspacePrepareVersion = 0;
  /** Sessions running in read-only mode (no worktree, using user's repo checkout) */
  private readOnlySessions = new Set<string>();
  private pendingInputToolUseIds = new Map<string, string>();
  private sessionRunSequence = new Map<string, number>();
  private activeRuns = new Map<string, number>();
  private outbox = new BridgeOutbox();
  private terminalManager: TerminalManager;
  private autoSyncManager: LinkedCheckoutAutoSyncManager;
  private getSessionCookieHeader: (url: string) => Promise<string | null>;
  private traceRuntime = ensureTraceRuntime(path.join(os.homedir(), ".trace", "runtime"));

  private gitExec: GitExecFn = (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile("git", args, { cwd, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

  constructor(serverUrl: string, getSessionCookieHeader: (url: string) => Promise<string | null>) {
    this.serverUrl = serverUrl;
    this.getSessionCookieHeader = getSessionCookieHeader;
    this.instanceId = getOrCreateInstanceId();
    this.terminalManager = new TerminalManager({
      onOutput: (terminalId, data) => {
        this.send({ type: "terminal_output", terminalId, data });
      },
      onExit: (terminalId, exitCode) => {
        this.send({ type: "terminal_exit", terminalId, exitCode });
      },
    });
    this.autoSyncManager = new LinkedCheckoutAutoSyncManager(LINKED_CHECKOUT_AUTO_SYNC_INTERVAL_MS);
    setAutoSyncManager(this.autoSyncManager);
  }

  connect() {
    const attempt = ++this.connectAttempt;
    this.cancelPendingReconnect();
    if (!this.authContext) {
      runtimeDebug("desktop bridge connect skipped awaiting auth", {
        instanceId: this.instanceId,
      });
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("connecting");
    runtimeDebug("desktop bridge connecting", {
      serverUrl: this.serverUrl,
      instanceId: this.instanceId,
    });
    void this.openSocket(attempt);
  }

  setAuthContext(organizationId: string | null) {
    const nextContext = organizationId ? { organizationId } : null;
    const changed = this.authContext?.organizationId !== nextContext?.organizationId;

    this.authContext = nextContext;
    this.bridgeAuthToken = null;
    runtimeDebug("desktop bridge auth context updated", {
      instanceId: this.instanceId,
      hasAuthContext: !!nextContext,
      organizationId: nextContext?.organizationId ?? null,
      changed,
    });

    if (!nextContext) {
      this.disconnect();
      return;
    }

    if (changed) {
      this.forceReconnect();
    } else if (this.status === "disconnected") {
      this.connect();
    }
  }

  private async openSocket(attempt: number) {
    let bridgeAuthToken: string;
    try {
      bridgeAuthToken = await this.fetchBridgeAuthToken();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[bridge] failed to fetch bridge auth token:", message);
      runtimeDebug("desktop bridge auth token fetch failed", {
        instanceId: this.instanceId,
        error: message,
      });
      this.setStatus("disconnected");
      if (attempt === this.connectAttempt && this.authContext) {
        this.scheduleReconnect(5000);
      }
      return;
    }

    if (attempt !== this.connectAttempt) return;

    const bridgeUrl = new URL(`${this.serverUrl}/bridge`);
    bridgeUrl.searchParams.set("bridgeAuthToken", bridgeAuthToken);
    const socket = new WebSocket(bridgeUrl.toString(), {
      headers: { "User-Agent": BRIDGE_USER_AGENT },
    });
    this.ws = socket;

    socket.on("open", () => {
      if (this.ws !== socket) return;
      console.log("[bridge] connected to server");
      runtimeDebug("desktop bridge websocket open", { instanceId: this.instanceId });
      this.setStatus("connected");
      this.sendRuntimeHello();
      this.flushOutbox();
      this.startHeartbeat();
      this.startLocalPrPolling();
      this.autoSyncManager.start();
      void this.pollLocalPrStatuses();
    });

    socket.on("message", (data) => {
      if (this.ws !== socket) return;
      try {
        const msg = JSON.parse(data.toString()) as BridgeCommand;
        this.handleCommand(msg);
      } catch (err) {
        console.error("[bridge] failed to parse message:", err);
      }
    });

    socket.on("close", (code, reason) => {
      if (this.ws !== socket) return;
      this.ws = null;
      const reasonText = reason.toString();
      console.log(
        `[bridge] disconnected, reconnecting in 3s... code=${code}${
          reasonText ? ` reason=${reasonText}` : ""
        }`,
      );
      this.stopHeartbeat();
      this.stopLocalPrPolling();
      this.autoSyncManager.stop();
      runtimeDebug("desktop bridge websocket closed", {
        instanceId: this.instanceId,
        code,
        reason: reasonText || null,
      });
      this.setStatus("disconnected");
      if (this.authContext) {
        this.scheduleReconnect(3000);
      }
    });

    socket.on("error", (err) => {
      if (this.ws !== socket) {
        runtimeDebug("desktop bridge stale websocket error", {
          instanceId: this.instanceId,
          error: err.message,
        });
        return;
      }
      console.error("[bridge] error:", err.message);
      runtimeDebug("desktop bridge websocket error", {
        instanceId: this.instanceId,
        error: err.message,
      });
    });
  }

  send(data: BridgeMessage) {
    if (this.sendNow(data)) return;
    if (!this.outbox.enqueue(data)) {
      console.warn(`[bridge] dropping bridge message while disconnected: ${data.type}`);
    }
  }

  private sendNow(data: BridgeMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(data));
    return true;
  }

  private flushOutbox() {
    const flushed = this.outbox.flush((message) => this.sendNow(message));
    if (flushed > 0) {
      runtimeDebug("desktop bridge flushed outbound queue", {
        instanceId: this.instanceId,
        flushed,
        remaining: this.outbox.size,
      });
    }
  }

  disconnect() {
    this.cancelPendingReconnect();
    this.stopHeartbeat();
    this.stopLocalPrPolling();
    this.autoSyncManager.stop();
    this.terminalManager.destroyAll();
    for (const [sessionId, adapter] of this.adapters.entries()) {
      this.cancelRun(sessionId);
      adapter.abort();
    }
    this.adapters.clear();
    this.outbox.clear();
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
    this.pendingInputToolUseIds.clear();
  }

  /**
   * Force an immediate reconnect — used after system wake to avoid waiting
   * for the stale WebSocket to time out on its own.
   */
  forceReconnect() {
    console.log("[bridge] force reconnecting...");
    runtimeDebug("desktop bridge force reconnect", { instanceId: this.instanceId });
    this.cancelPendingReconnect();
    this.stopHeartbeat();
    this.stopLocalPrPolling();
    this.autoSyncManager.stop();
    // Detach the old socket before closing it so its handlers can safely consume
    // teardown errors without changing the new connection's state.
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.close();
    }
    this.setStatus("disconnected");
    this.connect();
  }

  getInfo() {
    return {
      instanceId: this.instanceId,
      label: this.getLabel(),
      status: this.status,
    };
  }

  updateLabel() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendRuntimeHello();
    }
  }

  refreshCapabilities() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendRuntimeHello();
    }
  }

  private cancelPendingReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(delayMs: number) {
    if (!this.authContext) return;
    this.cancelPendingReconnect();
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
  }

  private async fetchBridgeAuthToken(): Promise<string> {
    if (!this.authContext) {
      throw new Error("Bridge auth context is not available");
    }

    if (this.bridgeAuthToken && this.bridgeAuthToken.expiresAt - Date.now() > 30_000) {
      return this.bridgeAuthToken.token;
    }

    const url = new URL(`${this.serverUrl}/auth/bridge-token`);
    url.searchParams.set("instanceId", this.instanceId);
    const cookieHeader = await this.getSessionCookieHeader(url.toString());
    if (!cookieHeader) {
      throw new Error("Bridge session cookie is not available");
    }

    const response = await fetch(url, {
      headers: {
        Cookie: cookieHeader,
        "X-Organization-Id": this.authContext.organizationId,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `Auth request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      token?: unknown;
      expiresAt?: unknown;
      localMode?: unknown;
    };
    if (
      typeof payload.token !== "string" ||
      typeof payload.expiresAt !== "string" ||
      typeof payload.localMode !== "boolean"
    ) {
      throw new Error("Invalid bridge auth token response");
    }

    const expiresAt = Date.parse(payload.expiresAt);
    if (Number.isNaN(expiresAt)) {
      throw new Error("Invalid bridge auth token expiry");
    }

    this.bridgeAuthToken = {
      token: payload.token,
      expiresAt,
    };
    this.localPrPollingEnabled = payload.localMode;
    return payload.token;
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

  private startRun(sessionId: string): number {
    const runId = (this.sessionRunSequence.get(sessionId) ?? 0) + 1;
    this.sessionRunSequence.set(sessionId, runId);
    this.activeRuns.set(sessionId, runId);
    return runId;
  }

  private finishRun(sessionId: string, runId: number) {
    if (this.activeRuns.get(sessionId) === runId) {
      this.activeRuns.delete(sessionId);
    }
  }

  private cancelRun(sessionId: string) {
    this.activeRuns.delete(sessionId);
  }

  private isCurrentRun(sessionId: string, adapter: CodingToolAdapter, runId: number): boolean {
    return this.adapters.get(sessionId) === adapter && this.activeRuns.get(sessionId) === runId;
  }

  private sendRuntimeHello() {
    // Announce identity — the server restores session bindings from the DB
    // using our stable instanceId, so we don't need to report session lists.
    const config = readConfig();
    const label = this.getLabel();
    const supportedTools = ["custom"];
    if (hasExecutable("claude")) supportedTools.push("claude_code");
    if (hasExecutable("codex")) supportedTools.push("codex");
    if (hasExecutable("pi")) supportedTools.push("pi");
    if (hasExecutable("agy")) supportedTools.push("antigravity");
    if (hasExecutable("cursor-agent")) supportedTools.push("cursor_composer");
    runtimeDebug("desktop bridge sending runtime_hello", {
      instanceId: this.instanceId,
      label,
      supportedTools,
      registeredRepoIds: Object.keys(config.repos),
    });
    this.send({
      type: "runtime_hello",
      instanceId: this.instanceId,
      label,
      hostingMode: "local",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      supportedTools,
      registeredRepoIds: Object.keys(config.repos),
      activeTerminals: this.terminalManager.getActiveTerminals(),
    });
  }

  private getLabel(): string {
    return getBridgeLabel() ?? os.hostname();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: "runtime_heartbeat",
        instanceId: this.instanceId,
        activeSessionIds: [...this.activeRuns.keys()],
      });
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
    runtimeDebug("desktop bridge status changed", {
      instanceId: this.instanceId,
      from: this.status,
      to: status,
    });
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    switch (tool) {
      case "antigravity":
        return new AntigravityAdapter();
      case "pi":
        return new PiAdapter();
      case "codex":
        return new CodexAdapter();
      case "cursor_composer":
        return new CursorComposerAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private startLocalPrPolling() {
    this.stopLocalPrPolling();
    this.localPrPollTimer = setInterval(() => {
      void this.pollLocalPrStatuses();
    }, LOCAL_PR_POLL_INTERVAL_MS);
  }

  private stopLocalPrPolling() {
    if (this.localPrPollTimer) {
      clearInterval(this.localPrPollTimer);
      this.localPrPollTimer = null;
    }
    this.isPollingLocalPrs = false;
  }

  private getTrackedPrWorkspaces(): TrackedSessionWorkspace[] {
    return collectTrackedPrWorkspaces(this.sessionWorkdirs, this.sessionGroupIds);
  }

  private async pollLocalPrStatuses() {
    if (
      !this.localPrPollingEnabled ||
      !hasExecutable("gh") ||
      this.isPollingLocalPrs ||
      this.ws?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    this.isPollingLocalPrs = true;

    try {
      await Promise.all(
        this.getTrackedPrWorkspaces().map(async ({ sessionIds, workdir }) => {
          const observedAt = new Date().toISOString();

          try {
            const { branch, pr } = await inspectLocalPrStatus(workdir);
            for (const sessionId of sessionIds) {
              this.send({
                type: "session_pr_status",
                sessionId,
                branch,
                observedAt,
                pr,
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[bridge] failed to inspect local PR status for ${workdir}: ${message}`);
            const branch = await maybeReadGitRef(workdir, [
              "symbolic-ref",
              "--short",
              "-q",
              "HEAD",
            ]);
            for (const sessionId of sessionIds) {
              this.send({
                type: "session_pr_status",
                sessionId,
                branch,
                observedAt,
                pr: null,
                error: message,
              });
            }
          }
        }),
      );
    } finally {
      this.isPollingLocalPrs = false;
    }
  }

  private async runPrompt({
    sessionId,
    prompt,
    cwd,
    tool,
    model,
    reasoningEffort,
    enableClaudeInChrome,
    interactionMode,
    toolSessionId,
    imageUrls,
    runtimeEnv,
  }: {
    sessionId: string;
    prompt: string;
    cwd: string;
    tool?: string;
    model?: string;
    reasoningEffort?: string;
    enableClaudeInChrome?: boolean;
    interactionMode?: string;
    toolSessionId?: string;
    imageUrls?: string[];
    runtimeEnv?: Record<string, string>;
  }) {
    const workdir = cwd;
    const traceRuntime = await this.traceRuntime;
    const invocationEnv = buildTraceInvocationEnv({
      runtimeEnv,
      serverUrl: this.serverUrl,
      skillsDir: traceRuntime.skillsDir,
      binDir: traceRuntime.binDir,
      nodeBinary: process.execPath,
      basePath: process.env.PATH,
      electronRunAsNode: true,
    });

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

    const priorPendingToolUseId = this.pendingInputToolUseIds.get(sessionId) ?? null;
    let hasForwardedOutput = false;
    let endedOnPending = false;
    let recoveringMissingToolSession = false;

    // Download attached files to temp files
    let imagePaths: string[] | undefined;
    if (imageUrls?.length) {
      runtimeDebug("downloading session files", { sessionId, count: imageUrls.length });
      try {
        imagePaths = await downloadAttachmentsToTempFiles(imageUrls, {
          fs,
          path,
          tmpdir: os.tmpdir,
          randomUUID: crypto.randomUUID,
        });
        runtimeDebug("downloaded session files", { sessionId, count: imagePaths.length });
      } catch (err) {
        console.error(`[bridge] Failed to download files for ${sessionId}:`, err);
      }
    }

    // Prepend file paths to prompt so all adapters see them
    let finalPrompt = prompt;
    if (imagePaths?.length) {
      const refs = imagePaths.map((p) => `[Attached file: ${p}]`).join("\n");
      finalPrompt = `${refs}\n\n${prompt}`;
    }

    // Single owner of temp-image lifetime so we don't leak files when the
    // adapter ends via the pending-input branch (which doesn't always fire
    // onComplete).
    let imagesCleanedUp = false;
    const cleanupImages = () => {
      if (imagePaths && !imagesCleanedUp) {
        imagesCleanedUp = true;
        cleanupTempAttachments(imagePaths, fs);
      }
    };

    const runId = this.startRun(sessionId);
    adapter.abort();

    // Capture adapter/run identity so callbacks from older runs are dropped.
    const activeAdapter = adapter;
    const recoverMissingToolSession = (message: string) => {
      if (!toolSessionId || hasForwardedOutput || recoveringMissingToolSession) return false;
      if (!isMissingToolSessionError(message)) return false;

      recoveringMissingToolSession = true;
      this.finishRun(sessionId, runId);
      activeAdapter.abort();
      this.adapters.delete(sessionId);
      this.reportedToolSessionIds.delete(sessionId);
      this.pendingInputToolUseIds.delete(sessionId);
      cleanupImages();
      this.send({
        type: "tool_session_missing",
        sessionId,
        toolSessionId,
        message,
        interactionMode,
        imageUrls,
      });
      return true;
    };

    adapter.run({
      prompt: finalPrompt,
      cwd: workdir,
      onOutput: (output) => {
        if (!this.isCurrentRun(sessionId, activeAdapter, runId)) return;

        if (output.type === "error" && recoverMissingToolSession(output.message)) {
          return;
        }

        const maybeReportToolSessionId = () => {
          if (adapter.getSessionId) {
            const sid = adapter.getSessionId();
            if (sid && sid !== this.reportedToolSessionIds.get(sessionId)) {
              this.reportedToolSessionIds.set(sessionId, sid);
              this.send({ type: "tool_session_id", sessionId, toolSessionId: sid });
            }
          }
        };

        const pendingToolUseId = getPendingInputToolUseId(output);
        const isReplayOfPriorPending =
          !hasForwardedOutput &&
          priorPendingToolUseId !== null &&
          pendingToolUseId === priorPendingToolUseId;

        if (isReplayOfPriorPending) {
          maybeReportToolSessionId();
          return;
        }

        hasForwardedOutput = true;
        const message = actionableErrorMessage(output);
        const sourceTool = tool ?? this.sessionTools.get(sessionId);
        const artifact = message ? actionRequiredArtifactForToolError(sourceTool, message) : undefined;
        const data =
          output.type === "error" || output.type === "assistant"
            ? {
                ...output,
                ...(sourceTool ? { sourceTool } : {}),
                ...(artifact ? { artifact } : {}),
              }
            : output;
        this.send({
          type: "session_output",
          sessionId,
          data,
          invocationId: runtimeEnv?.TRACE_INVOCATION_ID,
        });

        maybeReportToolSessionId();

        if (isPendingInputOutput(output)) {
          endedOnPending = true;
          if (pendingToolUseId) {
            this.pendingInputToolUseIds.set(sessionId, pendingToolUseId);
          } else {
            this.pendingInputToolUseIds.delete(sessionId);
          }
          this.finishRun(sessionId, runId);
          this.send({
            type: "session_complete",
            sessionId,
            invocationId: runtimeEnv?.TRACE_INVOCATION_ID,
          });
          activeAdapter.abort();
          cleanupImages();
        }
      },
      onComplete: () => {
        if (!this.isCurrentRun(sessionId, activeAdapter, runId)) return;
        if (recoveringMissingToolSession) return;
        if (!endedOnPending && priorPendingToolUseId) {
          this.pendingInputToolUseIds.delete(sessionId);
        }
        this.finishRun(sessionId, runId);
        this.send({
          type: "session_complete",
          sessionId,
          invocationId: runtimeEnv?.TRACE_INVOCATION_ID,
        });
        cleanupImages();
      },
      interactionMode: interactionMode as "code" | "plan" | "ask" | undefined,
      model,
      reasoningEffort,
      enableClaudeInChrome,
      toolSessionId,
      runtimeEnv: invocationEnv,
    });
  }

  /**
   * Run a prompt once the session's workspace is settled.
   *
   * A reconnect re-prepares the workspace, and the server can deliver the user's
   * message while that is still running. Spawning the coding tool then would
   * point it at a tree being rewritten by `git reset`/`git clean`. If prep fails
   * outright the command is refused. The service layer retains commands while
   * workspace state is not ready, so the bridge never becomes their durable
   * owner.
   */
  private async runAfterWorkspacePrep(cmd: BridgeRunCommand | BridgeSendCommand) {
    const { sessionId } = cmd;
    const prepare = this.sessionPrepares.get(sessionId);
    if (prepare) {
      try {
        await prepare;
      } catch {
        // workspace_failed was already reported by the prepare handler.
        return;
      }
    }
    const workdir = resolveBridgeWorkdir({
      workspaceMode: cmd.workspaceMode,
      cwd: cmd.cwd,
      preparedWorkdir: this.sessionWorkdirs.get(sessionId),
      homeDir: os.homedir(),
    });
    if (!workdir) {
      this.markWorkspaceFailed(
        sessionId,
        "Trace refused to start the agent because this session has no prepared workspace.",
      );
      return;
    }
    await this.runPrompt({
      sessionId,
      prompt: cmd.prompt ?? "",
      // Prefer the freshly prepared workdir: the server's `cwd` was read before
      // prep ran and can name a path that prep has since moved or renamed.
      cwd: workdir,
      tool: cmd.tool,
      model: cmd.model,
      reasoningEffort: cmd.reasoningEffort,
      enableClaudeInChrome: cmd.enableClaudeInChrome,
      interactionMode: cmd.interactionMode,
      toolSessionId: cmd.toolSessionId,
      imageUrls: cmd.imageUrls,
      runtimeEnv: cmd.runtimeEnv,
    });
  }

  private beginWorkspacePreparation(sessionId: string): number {
    const version = ++this.nextWorkspacePrepareVersion;
    this.workspacePrepareVersions.set(sessionId, version);
    // A previous path is not proof that the new preparation is safe to use.
    this.sessionWorkdirs.delete(sessionId);
    return version;
  }

  private isCurrentWorkspacePreparation(sessionId: string, version: number): boolean {
    return this.workspacePrepareVersions.get(sessionId) === version;
  }

  private markWorkspaceReady(sessionId: string, workdir: string, version?: number) {
    if (version !== undefined && !this.isCurrentWorkspacePreparation(sessionId, version)) return;
    this.sessionWorkdirs.set(sessionId, workdir);
  }

  private markWorkspaceFailed(sessionId: string, error: string, version?: number) {
    if (version !== undefined && !this.isCurrentWorkspacePreparation(sessionId, version)) return;
    this.send({ type: "workspace_failed", sessionId, error });
  }

  private trackWorkspacePreparation(sessionId: string, prepared: Promise<void>) {
    this.sessionPrepares.set(sessionId, prepared);
    const clearPrepare = () => {
      if (this.sessionPrepares.get(sessionId) === prepared) {
        this.sessionPrepares.delete(sessionId);
      }
    };
    void prepared.then(clearPrepare, clearPrepare);
  }

  private handleCommand(cmd: BridgeCommand) {
    switch (cmd.type) {
      case "run":
      case "send": {
        void this.runAfterWorkspacePrep(cmd);
        break;
      }
      case "prepare_general": {
        const prepareVersion = this.beginWorkspacePreparation(cmd.sessionId);
        const workdir = os.homedir();
        this.markWorkspaceReady(cmd.sessionId, workdir, prepareVersion);
        this.sessionGroupIds.set(cmd.sessionId, cmd.sessionGroupId ?? null);
        this.readOnlySessions.delete(cmd.sessionId);
        this.send({ type: "workspace_ready", sessionId: cmd.sessionId, workdir });
        break;
      }
      case "cleanup_general_workspace": {
        this.send({
          type: "cleanup_general_workspace_result",
          sessionId: cmd.sessionId,
          success: true,
        });
        break;
      }
      case "prepare": {
        const {
          sessionId,
          sessionGroupId,
          slug,
          repoId,
          repoName,
          defaultBranch,
          branch,
          preserveBranchName,
          baseCommitSha,
          readOnly,
          adoptWorktreePath,
        } = cmd;
        const repoConfig = getRepoConfig(repoId);
        const repoPath = repoConfig?.path;
        const prepareVersion = this.beginWorkspacePreparation(sessionId);

        if (!repoPath) {
          this.markWorkspaceFailed(
            sessionId,
            `No local path configured for repo "${repoName}" (${repoId}). Configure it in Settings.`,
            prepareVersion,
          );
          break;
        }

        // Adopting an existing worktree takes precedence: use it as-is (its own
        // branch, no reset), rather than creating or reusing a Trace worktree.
        if (adoptWorktreePath) {
          const prepared = adoptWorktree({
            repoPath,
            repoId,
            worktreePath: adoptWorktreePath,
            slug,
          })
            .then(({ workdir, branch: adoptedBranch, slug: adoptedSlug }) => {
              this.markWorkspaceReady(sessionId, workdir, prepareVersion);
              if (!this.isCurrentWorkspacePreparation(sessionId, prepareVersion)) return;
              this.sessionGroupIds.set(sessionId, sessionGroupId ?? null);
              this.readOnlySessions.delete(sessionId);
              this.send({
                type: "workspace_ready",
                sessionId,
                workdir,
                branch: adoptedBranch,
                slug: adoptedSlug,
              });
              void this.pollLocalPrStatuses();
            })
            .catch((err: Error) => {
              this.markWorkspaceFailed(sessionId, err.message, prepareVersion);
              throw err;
            });
          this.trackWorkspacePreparation(sessionId, prepared);
          break;
        }

        if (readOnly) {
          // Read-only mode: skip worktree, use the user's actual repo checkout
          this.markWorkspaceReady(sessionId, repoPath, prepareVersion);
          this.sessionGroupIds.set(sessionId, sessionGroupId ?? null);
          this.readOnlySessions.add(sessionId);
          this.send({ type: "workspace_ready", sessionId, workdir: repoPath });
          void this.pollLocalPrStatuses();
          break;
        }

        // Coalesce concurrent createWorktree calls for the same group
        const worktreeKey = slug ?? sessionGroupId ?? sessionId;
        let worktreePromise = this.pendingWorktrees.get(worktreeKey);
        if (!worktreePromise) {
          worktreePromise = createWorktree({
            repoPath,
            repoId,
            sessionId,
            sessionGroupId,
            slug,
            defaultBranch,
            startBranch: branch,
            preserveBranchName,
            baseCommitSha,
          });
          this.pendingWorktrees.set(worktreeKey, worktreePromise);
          void worktreePromise
            .finally(() => this.pendingWorktrees.delete(worktreeKey))
            .catch(() => undefined);
        }
        const prepared = worktreePromise
          .then(({ workdir, branch: worktreeBranch, slug: worktreeSlug, warning }) => {
            this.markWorkspaceReady(sessionId, workdir, prepareVersion);
            if (!this.isCurrentWorkspacePreparation(sessionId, prepareVersion)) return;
            this.sessionGroupIds.set(sessionId, sessionGroupId ?? null);
            this.send({
              type: "workspace_ready",
              sessionId,
              workdir,
              branch: worktreeBranch,
              slug: worktreeSlug,
              ...(warning ? { warning } : {}),
            });
            void this.pollLocalPrStatuses();
          })
          .catch((err: Error) => {
            this.markWorkspaceFailed(sessionId, err.message, prepareVersion);
            throw err;
          });
        // Tracked so a prompt arriving mid-prep waits for the workspace instead
        // of running against a tree that is being reset underneath it. Settling
        // is observed here first (registered before any waiter), so a waiter
        // resumes with the workdir already recorded and the entry cleared.
        this.trackWorkspacePreparation(sessionId, prepared);
        break;
      }
      case "list_workspace_slugs": {
        const repoConfig = getRepoConfig(cmd.repoId);
        const repoPath = repoConfig?.path;
        if (!repoPath) {
          this.send({
            type: "workspace_slugs_result",
            requestId: cmd.requestId,
            slugs: [],
            error: "Repo not linked",
          });
          break;
        }

        const sessionsDir = path.join(os.homedir(), "trace", "sessions", cmd.repoId);
        getUsedSlugs(sessionsDir, repoPath)
          .then((slugs) => {
            this.send({
              type: "workspace_slugs_result",
              requestId: cmd.requestId,
              slugs: [...slugs],
            });
          })
          .catch((err: Error) => {
            this.send({
              type: "workspace_slugs_result",
              requestId: cmd.requestId,
              slugs: [],
              error: err.message,
            });
          });
        break;
      }
      case "list_worktrees": {
        const repoPath = getRepoConfig(cmd.repoId)?.path;
        if (!repoPath) {
          this.send({
            type: "worktrees_result",
            requestId: cmd.requestId,
            worktrees: [],
            error: "Repo not linked",
          });
          break;
        }

        listRepoWorktrees(repoPath, cmd.repoId)
          .then((worktrees) => {
            this.send({ type: "worktrees_result", requestId: cmd.requestId, worktrees });
          })
          .catch((err: Error) => {
            this.send({
              type: "worktrees_result",
              requestId: cmd.requestId,
              worktrees: [],
              error: err.message,
            });
          });
        break;
      }
      case "upgrade_workspace": {
        const {
          sessionId,
          sessionGroupId,
          slug,
          repoId,
          repoName,
          defaultBranch,
          branch,
          preserveBranchName,
        } = cmd;
        const repoConfig = getRepoConfig(repoId);
        const repoPath = repoConfig?.path;
        const prepareVersion = this.beginWorkspacePreparation(sessionId);

        if (!repoPath) {
          this.markWorkspaceFailed(
            sessionId,
            `No local path configured for repo "${repoName}" (${repoId}). Configure it in Settings.`,
            prepareVersion,
          );
          break;
        }

        const prepared = createWorktree({
          repoPath,
          repoId,
          sessionId,
          sessionGroupId,
          slug,
          defaultBranch,
          startBranch: branch,
          preserveBranchName,
        })
          .then(({ workdir, branch: worktreeBranch, slug: worktreeSlug }) => {
            this.markWorkspaceReady(sessionId, workdir, prepareVersion);
            if (!this.isCurrentWorkspacePreparation(sessionId, prepareVersion)) return;
            this.sessionGroupIds.set(sessionId, sessionGroupId ?? null);
            this.readOnlySessions.delete(sessionId);
            this.send({
              type: "workspace_ready",
              sessionId,
              workdir,
              branch: worktreeBranch,
              slug: worktreeSlug,
            });
            void this.pollLocalPrStatuses();
          })
          .catch((err: Error) => {
            this.markWorkspaceFailed(sessionId, err.message, prepareVersion);
            throw err;
          });
        this.trackWorkspacePreparation(sessionId, prepared);
        break;
      }
      case "terminate": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          // Abort the running process but keep the adapter so it retains
          // the Claude Code session ID for --resume on subsequent messages.
          this.cancelRun(cmd.sessionId);
          adapter.abort();
        }
        break;
      }
      case "pause": {
        const pauseAdapter = this.adapters.get(cmd.sessionId);
        if (pauseAdapter) {
          this.cancelRun(cmd.sessionId);
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
          this.cancelRun(cmd.sessionId);
          deleteAdapter.abort();
          this.adapters.delete(cmd.sessionId);
        }
        this.sessionTools.delete(cmd.sessionId);
        this.reportedToolSessionIds.delete(cmd.sessionId);
        this.pendingInputToolUseIds.delete(cmd.sessionId);
        this.sessionRunSequence.delete(cmd.sessionId);
        const wasReadOnly = this.readOnlySessions.has(cmd.sessionId);
        this.readOnlySessions.delete(cmd.sessionId);
        this.sessionWorkdirs.delete(cmd.sessionId);
        this.sessionPrepares.delete(cmd.sessionId);
        this.workspacePrepareVersions.delete(cmd.sessionId);
        this.sessionGroupIds.delete(cmd.sessionId);
        this.terminalManager.destroyForSession(cmd.sessionId);

        // Clean up worktree if one exists — skip for read-only sessions (no
        // worktree to remove) and for adopted worktrees the user owns (anything
        // outside Trace's managed sessions directory).
        if (
          cmd.workdir &&
          cmd.repoId &&
          !wasReadOnly &&
          isTraceManagedWorktreePath(cmd.repoId, cmd.workdir)
        ) {
          const repoPath = getRepoConfig(cmd.repoId)?.path;
          if (repoPath) {
            removeWorktree({ repoPath, worktreePath: cmd.workdir }).catch((err: Error) => {
              console.warn(`[bridge] failed to remove worktree ${cmd.workdir}:`, err.message);
            });
          }
        }
        break;
      }
      case "track_session": {
        if (!fs.existsSync(cmd.workdir)) {
          this.send({
            type: "workspace_failed",
            sessionId: cmd.sessionId,
            error: `The prepared workspace no longer exists at ${cmd.workdir}`,
          });
          break;
        }
        const prepareVersion = this.beginWorkspacePreparation(cmd.sessionId);
        this.sessionPrepares.delete(cmd.sessionId);
        this.markWorkspaceReady(cmd.sessionId, cmd.workdir, prepareVersion);
        this.sessionGroupIds.set(cmd.sessionId, cmd.sessionGroupId ?? null);
        if (cmd.readOnly) {
          this.readOnlySessions.add(cmd.sessionId);
        } else {
          this.readOnlySessions.delete(cmd.sessionId);
        }
        void this.pollLocalPrStatuses();
        break;
      }
      case "list_branches": {
        const { requestId, repoId } = cmd;
        const repoPath = getRepoConfig(repoId)?.path;

        if (!repoPath) {
          this.send({ type: "branches_result", requestId, branches: [], error: "Repo not linked" });
          break;
        }

        execFile(
          "git",
          ["branch", "-a", "--format=%(refname:short)"],
          { cwd: repoPath },
          (err, stdout) => {
            if (err) {
              this.send({ type: "branches_result", requestId, branches: [], error: err.message });
              return;
            }
            this.send({ type: "branches_result", requestId, branches: parseBranchOutput(stdout) });
          },
        );
        break;
      }
      case "linked_checkout_status": {
        void getLinkedCheckoutStatus(cmd.repoId)
          .then((status) => {
            this.send({ type: "linked_checkout_status_result", requestId: cmd.requestId, status });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(
              `[bridge] failed to read linked checkout status for ${cmd.repoId}:`,
              message,
            );
            this.send({
              type: "linked_checkout_status_result",
              requestId: cmd.requestId,
              status: emptyLinkedCheckoutStatus(cmd.repoId),
            });
          });
        break;
      }
      case "linked_checkout_changed_file": {
        void getLinkedCheckoutChangedFile(cmd.repoId, cmd.filePath)
          .then((file) => {
            this.send({
              type: "linked_checkout_changed_file_result",
              requestId: cmd.requestId,
              file,
            });
          })
          .catch((error: unknown) => {
            this.send({
              type: "linked_checkout_changed_file_result",
              requestId: cmd.requestId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        break;
      }
      case "linked_checkout_link_repo": {
        void linkLinkedCheckoutRepo(cmd.repoId, cmd.localPath)
          .then((result) => {
            if (result.ok) {
              this.send({ type: "repo_linked", repoId: cmd.repoId });
            }
            this.send({
              type: "linked_checkout_action_result",
              requestId: cmd.requestId,
              action: "link_repo",
              result,
            });
          })
          .catch((error: unknown) => {
            console.error(`[bridge] failed to link local repo for ${cmd.repoId}:`, error);
            void buildLinkedCheckoutFailureResult(cmd.repoId, error).then((result) => {
              this.send({
                type: "linked_checkout_action_result",
                requestId: cmd.requestId,
                action: "link_repo",
                result,
              });
            });
          });
        break;
      }
      case "linked_checkout_sync": {
        void syncLinkedCheckout({
          repoId: cmd.repoId,
          sessionGroupId: cmd.sessionGroupId,
          branch: cmd.branch,
          commitSha: cmd.commitSha,
          autoSyncEnabled: cmd.autoSyncEnabled,
          refreshBeforeSync: cmd.refreshBeforeSync,
          conflictStrategy: cmd.conflictStrategy,
          commitMessage: cmd.commitMessage,
        })
          .then((result) => {
            this.send({
              type: "linked_checkout_action_result",
              requestId: cmd.requestId,
              action: "sync",
              result,
            });
          })
          .catch((error: unknown) => {
            console.error(`[bridge] failed to sync linked checkout for ${cmd.repoId}:`, error);
            void buildLinkedCheckoutFailureResult(cmd.repoId, error).then((result) => {
              this.send({
                type: "linked_checkout_action_result",
                requestId: cmd.requestId,
                action: "sync",
                result,
              });
            });
          });
        break;
      }
      case "linked_checkout_commit": {
        void commitLinkedCheckoutChanges({
          repoId: cmd.repoId,
          sessionGroupId: cmd.sessionGroupId,
          message: cmd.message,
        })
          .then((result) => {
            this.send({
              type: "linked_checkout_action_result",
              requestId: cmd.requestId,
              action: "commit",
              result,
            });
          })
          .catch((error: unknown) => {
            console.error(
              `[bridge] failed to commit linked checkout changes for ${cmd.repoId}:`,
              error,
            );
            void buildLinkedCheckoutFailureResult(cmd.repoId, error).then((result) => {
              this.send({
                type: "linked_checkout_action_result",
                requestId: cmd.requestId,
                action: "commit",
                result,
              });
            });
          });
        break;
      }
      case "linked_checkout_restore": {
        void restoreLinkedCheckout(cmd.repoId)
          .then((result) => {
            this.send({
              type: "linked_checkout_action_result",
              requestId: cmd.requestId,
              action: "restore",
              result,
            });
          })
          .catch((error: unknown) => {
            console.error(`[bridge] failed to restore linked checkout for ${cmd.repoId}:`, error);
            void buildLinkedCheckoutFailureResult(cmd.repoId, error).then((result) => {
              this.send({
                type: "linked_checkout_action_result",
                requestId: cmd.requestId,
                action: "restore",
                result,
              });
            });
          });
        break;
      }
      case "linked_checkout_set_auto_sync": {
        void setLinkedCheckoutAutoSync(cmd.repoId, cmd.enabled)
          .then((result) => {
            this.send({
              type: "linked_checkout_action_result",
              requestId: cmd.requestId,
              action: "set_auto_sync",
              result,
            });
          })
          .catch((error: unknown) => {
            console.error(
              `[bridge] failed to update linked checkout auto-sync for ${cmd.repoId}:`,
              error,
            );
            void buildLinkedCheckoutFailureResult(cmd.repoId, error).then((result) => {
              this.send({
                type: "linked_checkout_action_result",
                requestId: cmd.requestId,
                action: "set_auto_sync",
                result,
              });
            });
          });
        break;
      }
      case "session_current_branch": {
        const workdir = this.sessionWorkdirs.get(cmd.sessionId) ?? cmd.workdirHint;
        if (!workdir) {
          this.send({
            type: "session_current_branch_result",
            requestId: cmd.requestId,
            error: "Session workdir is unavailable",
          });
          break;
        }
        void inspectSessionCurrentBranch((args, options) =>
          execFileAsync("git", args, {
            cwd: workdir,
            maxBuffer: options?.maxBuffer,
            timeout: options?.timeoutMs,
          }).then(({ stdout }) => String(stdout)),
        )
          .then((branch) => {
            this.send({
              type: "session_current_branch_result",
              requestId: cmd.requestId,
              branch,
            });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.send({
              type: "session_current_branch_result",
              requestId: cmd.requestId,
              error: message,
            });
          });
        break;
      }
      case "session_git_sync_status": {
        const workdir = this.sessionWorkdirs.get(cmd.sessionId) ?? cmd.workdirHint;
        if (!workdir) {
          this.send({
            type: "session_git_sync_status_result",
            requestId: cmd.requestId,
            error: "Session workdir is unavailable",
          });
          break;
        }
        void inspectSessionGitSyncStatus((args, options) =>
          execFileAsync("git", args, {
            cwd: workdir,
            maxBuffer: options?.maxBuffer,
            timeout: options?.timeoutMs,
          }).then(({ stdout }) => String(stdout)),
        )
          .then((status) => {
            this.send({
              type: "session_git_sync_status_result",
              requestId: cmd.requestId,
              status,
            });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.send({
              type: "session_git_sync_status_result",
              requestId: cmd.requestId,
              error: message,
            });
          });
        break;
      }
      case "list_files": {
        handleListFiles(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          gitLsFiles: (cwd, cb) =>
            execFile(
              "git",
              ["ls-files", "--cached", "--others", "--exclude-standard"],
              { cwd, maxBuffer: 5 * 1024 * 1024 },
              (err, stdout) => {
                if (err) return cb(err, []);
                cb(null, stdout.split("\n").filter(Boolean));
              },
            ),
          fs,
          path,
        });
        break;
      }
      case "read_file": {
        handleReadFile(cmd, this.sessionWorkdirs, (msg) => this.send(msg), { fs, path });
        break;
      }
      case "write_file":
      case "write_file_guarded": {
        handleWriteFile(cmd, this.sessionWorkdirs, (msg) => this.send(msg), { fs, path });
        break;
      }
      case "commit_file_changes":
      case "commit_scoped_file_changes": {
        void handleCommitFileChanges(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          fs,
          path,
          gitExec: this.gitExec,
        });
        break;
      }
      case "worktree_changes": {
        void handleWorktreeChanges(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          fs,
          path,
          gitExec: this.gitExec,
        });
        break;
      }
      case "revert_worktree_file": {
        void handleRevertWorktreeFile(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          fs,
          path,
          gitExec: this.gitExec,
        });
        break;
      }
      case "branch_diff": {
        void handleBranchDiff(cmd, this.sessionWorkdirs, (msg) => this.send(msg), this.gitExec);
        break;
      }
      case "file_at_ref": {
        void handleFileAtRef(cmd, this.sessionWorkdirs, (msg) => this.send(msg), this.gitExec);
        break;
      }
      case "list_skills": {
        void handleListSkills(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          userSkillsDirs: [
            path.join(os.homedir(), ".claude", "skills"),
            path.join(os.homedir(), ".codex", "skills"),
          ],
          fs,
          path,
        });
        break;
      }
      case "terminal_create": {
        const { terminalId, sessionId, ownerUserId, cols, rows, cwd } = cmd;
        const workdir = cwd || this.sessionWorkdirs.get(sessionId) || os.homedir();
        try {
          this.terminalManager.create(terminalId, sessionId, ownerUserId, workdir, cols, rows);
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
