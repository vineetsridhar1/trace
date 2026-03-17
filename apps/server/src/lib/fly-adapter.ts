import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

interface CreateMachineOptions {
  sessionId: string;
  tool: string;
  model?: string;
  repoRemoteUrl?: string;
  repoDefaultBranch?: string;
  branch?: string;
  userTokens?: Partial<Record<string, string>>;
}

const FLY_API_URL = process.env.FLY_API_URL ?? "https://api.machines.dev";
const FLY_API_TOKEN = process.env.FLY_API_TOKEN ?? "";
const FLY_APP_NAME = process.env.FLY_APP_NAME ?? "";
const CONTAINER_IMAGE = process.env.CONTAINER_IMAGE ?? "";
const TRACE_SERVER_PUBLIC_URL = process.env.TRACE_SERVER_PUBLIC_URL ?? "";

function machineUrl(machineId?: string): string {
  const base = `${FLY_API_URL}/v1/apps/${FLY_APP_NAME}/machines`;
  return machineId ? `${base}/${machineId}` : base;
}

async function flyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fly API ${options.method ?? "GET"} ${url} failed (${res.status}): ${body}`);
  }
  return res;
}

/**
 * Manages Fly Machine lifecycle for cloud sessions.
 * Once a machine boots, its container-bridge connects to /bridge
 * and the existing SessionRouter handles all command routing.
 */
export class FlyAdapter {
  /** sessionId → machineId for quick lookups */
  private sessionToMachine = new Map<string, string>();

  /** Valid bridge tokens for cloud connections */
  private validBridgeTokens = new Set<string>();

  /**
   * Restore session→machine mappings from DB on startup.
   * Call this once during server initialization.
   */
  async restoreFromDb(): Promise<void> {
    const cloudSessions = await prisma.session.findMany({
      where: {
        hosting: "cloud",
        status: { in: ["creating", "pending", "active", "paused", "needs_input", "completed", "failed"] },
      },
      select: { id: true, connection: true },
    });

    for (const session of cloudSessions) {
      const conn = session.connection as Record<string, unknown> | null;
      const machineId = conn?.machineId as string | undefined;
      const bridgeToken = conn?.bridgeToken as string | undefined;
      if (machineId) {
        this.sessionToMachine.set(session.id, machineId);
      }
      if (bridgeToken) {
        this.validBridgeTokens.add(bridgeToken);
      }
    }

    if (cloudSessions.length > 0) {
      console.log(`[fly-adapter] restored ${this.sessionToMachine.size} machine mappings`);
    }
  }

  /**
   * Create a Fly Machine for a cloud session.
   * Returns the machineId and bridgeToken.
   */
  async createMachine(options: CreateMachineOptions): Promise<{ machineId: string; bridgeToken: string }> {
    const { sessionId, tool, model, repoRemoteUrl, repoDefaultBranch, branch, userTokens } = options;
    const bridgeToken = randomUUID();

    const bridgeUrl = TRACE_SERVER_PUBLIC_URL.replace(/^http/, "ws") + "/bridge";

    const env: Record<string, string> = {
      TRACE_BRIDGE_URL: bridgeUrl,
      SESSION_ID: sessionId,
      BRIDGE_TOKEN: bridgeToken,
      CODING_TOOL: tool,
    };

    // Inject user-provided API tokens (override server-level defaults)
    if (userTokens?.anthropic) env.ANTHROPIC_API_KEY = userTokens.anthropic;
    else if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (userTokens?.openai) env.OPENAI_API_KEY = userTokens.openai;
    if (userTokens?.github) env.GITHUB_TOKEN = userTokens.github;
    else if (process.env.GITHUB_TOKEN) env.GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    if (model) env.MODEL = model;
    if (repoRemoteUrl) env.REPO_REMOTE_URL = repoRemoteUrl;
    if (repoDefaultBranch) env.REPO_DEFAULT_BRANCH = repoDefaultBranch;
    if (branch) env.BRANCH = branch;

    const body = {
      config: {
        image: CONTAINER_IMAGE,
        env,
        guest: { cpu_kind: "shared", cpus: 2, memory_mb: 2048 },
        auto_destroy: true,
      },
    };

    const res = await flyFetch(machineUrl(), {
      method: "POST",
      body: JSON.stringify(body),
    });

    const machine = (await res.json()) as { id: string };
    this.sessionToMachine.set(sessionId, machine.id);
    this.validBridgeTokens.add(bridgeToken);

    // Persist machineId and cloud runtime identity in session's connection JSON.
    // runtimeInstanceId matches what the container-bridge sends in runtime_hello,
    // so restoreSessionsForRuntime can rebind on reconnect.
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        connection: {
          state: "connected",
          retryCount: 0,
          canRetry: true,
          canMove: true,
          machineId: machine.id,
          bridgeToken,
          runtimeInstanceId: `cloud-${sessionId}`,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { machineId: machine.id, bridgeToken };
  }

  /**
   * Wait for a machine to reach the "started" state.
   */
  async waitForStarted(sessionId: string): Promise<void> {
    const machineId = this.getMachineId(sessionId);
    await flyFetch(`${machineUrl(machineId)}/wait?state=started`, {
      method: "GET",
    });
  }

  /**
   * Stop a machine (for pause/idle — preserves state, saves cost).
   */
  async stopMachine(sessionId: string): Promise<void> {
    const machineId = this.getMachineId(sessionId);
    await flyFetch(`${machineUrl(machineId)}/stop`, { method: "POST" });
  }

  /**
   * Start a stopped machine (for resume).
   */
  async startMachine(sessionId: string): Promise<void> {
    const machineId = this.getMachineId(sessionId);
    await flyFetch(`${machineUrl(machineId)}/start`, { method: "POST" });
  }

  /**
   * Destroy a machine permanently (for terminate/cleanup).
   * Pass `connectionData` if the session row may be deleted after this call.
   */
  async destroyMachine(sessionId: string, connectionData?: Record<string, unknown> | null): Promise<void> {
    // Try in-memory map first, then fall back to provided connection data or DB lookup
    let machineId = this.sessionToMachine.get(sessionId);
    let conn = connectionData ?? null;

    if (!machineId) {
      if (!conn) {
        const session = await prisma.session.findUnique({
          where: { id: sessionId },
          select: { connection: true },
        });
        conn = session?.connection as Record<string, unknown> | null;
      }
      machineId = conn?.machineId as string | undefined;
    }

    if (!machineId) {
      console.warn(`[fly-adapter] no machine ID found for session ${sessionId}, skipping destroy`);
      return;
    }

    // Clean up bridge token
    const bridgeToken = (conn?.bridgeToken ?? connectionData?.bridgeToken) as string | undefined;
    if (bridgeToken) {
      this.validBridgeTokens.delete(bridgeToken);
    }

    // Stop the machine first — Fly requires it to be stopped before deletion
    await flyFetch(`${machineUrl(machineId)}/stop`, { method: "POST" }).catch(() => {
      // May already be stopped — ignore errors
    });
    await flyFetch(`${machineUrl(machineId)}/wait?state=stopped&timeout=30`, { method: "GET" }).catch(() => {
      // Timeout or already stopped — proceed with delete
    });

    await flyFetch(machineUrl(machineId), {
      method: "DELETE",
      body: JSON.stringify({ force: true }),
    });

    this.sessionToMachine.delete(sessionId);
  }

  /**
   * Validate a bridge token for cloud connections.
   * Checks in-memory cache first, falls back to DB lookup
   * (handles server restarts where restoreFromDb hasn't completed yet).
   */
  async isValidBridgeToken(token: string): Promise<boolean> {
    if (this.validBridgeTokens.has(token)) return true;

    // DB fallback — the token may not be in memory yet after a server restart.
    // Include completed/failed: the machine may still be running and need to reconnect
    // for cleanup commands (delete/terminate).
    const session = await prisma.session.findFirst({
      where: {
        hosting: "cloud",
        connection: { path: ["bridgeToken"], equals: token },
      },
      select: { id: true, connection: true },
    });

    if (session) {
      // Populate caches so subsequent checks are fast
      this.validBridgeTokens.add(token);
      const conn = session.connection as Record<string, unknown> | null;
      const machineId = conn?.machineId as string | undefined;
      if (machineId) {
        this.sessionToMachine.set(session.id, machineId);
      }
      return true;
    }

    return false;
  }

  private getMachineId(sessionId: string): string {
    const machineId = this.sessionToMachine.get(sessionId);
    if (!machineId) {
      throw new Error(`No machine found for session ${sessionId}`);
    }
    return machineId;
  }
}

export const flyAdapter = new FlyAdapter();
