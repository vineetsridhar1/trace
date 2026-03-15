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
        status: { in: ["creating", "pending", "active", "paused", "needs_input"] },
      },
      select: { id: true, connection: true },
    });

    for (const session of cloudSessions) {
      const conn = session.connection as Record<string, unknown> | null;
      const machineId = conn?.machineId as string | undefined;
      if (machineId) {
        this.sessionToMachine.set(session.id, machineId);
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
    const { sessionId, tool, model, repoRemoteUrl, repoDefaultBranch, branch } = options;
    const bridgeToken = randomUUID();

    const bridgeUrl = TRACE_SERVER_PUBLIC_URL.replace(/^http/, "ws") + "/bridge";

    const env: Record<string, string> = {
      TRACE_BRIDGE_URL: bridgeUrl,
      SESSION_ID: sessionId,
      BRIDGE_TOKEN: bridgeToken,
      CODING_TOOL: tool,
    };
    if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
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

    // Persist machineId in session's connection JSON for durability
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        connection: { machineId: machine.id, bridgeToken } satisfies Prisma.InputJsonValue,
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
   */
  async destroyMachine(sessionId: string): Promise<void> {
    const machineId = this.getMachineId(sessionId);

    // Clean up bridge token
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { connection: true },
    });
    const conn = session?.connection as Record<string, unknown> | null;
    const bridgeToken = conn?.bridgeToken as string | undefined;
    if (bridgeToken) {
      this.validBridgeTokens.delete(bridgeToken);
    }

    await flyFetch(machineUrl(machineId), {
      method: "DELETE",
      body: JSON.stringify({ force: true }),
    });

    this.sessionToMachine.delete(sessionId);
  }

  /**
   * Validate a bridge token for cloud connections.
   */
  isValidBridgeToken(token: string): boolean {
    return this.validBridgeTokens.has(token);
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
