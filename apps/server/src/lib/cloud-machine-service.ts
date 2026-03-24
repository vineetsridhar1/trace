import { randomUUID } from "crypto";
import type { CloudMachine } from "@prisma/client";
import type { CloudMachineProvider } from "./cloud-machine-provider.js";
import { prisma } from "./db.js";

const TRACE_SERVER_PUBLIC_URL = process.env.TRACE_SERVER_PUBLIC_URL ?? "";
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Orchestrates cloud machine lifecycle. Single entry point for all VM operations.
 * The session router and session service call this — never the provider directly.
 */
export class CloudMachineService {
  /** Prevents duplicate creates for the same user+org */
  private creationLocks = new Map<string, Promise<CloudMachine>>();

  /** Idle timers — keyed by cloudMachineId */
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Valid bridge tokens for fast auth checks */
  private validBridgeTokens = new Set<string>();

  /** In-flight waitForStarted promises — keyed by cloudMachineId */
  private startupPromises = new Map<string, Promise<void>>();

  constructor(
    private readonly provider: CloudMachineProvider,
    private readonly providerName: string,
  ) {}

  /**
   * Get or create a machine for a user+org. Handles all states:
   * - started → return immediately
   * - stopped → restart, return
   * - creating → return (caller will waitForBridge)
   * - destroyed / not found → create new VM
   */
  async getOrCreateMachine(options: {
    userId: string;
    orgId: string;
    defaultTool: string;
    userTokens: Record<string, string>;
  }): Promise<CloudMachine> {
    const { userId, orgId } = options;
    const lockKey = `${userId}:${orgId}`;

    // Check for in-flight creation
    const existing = this.creationLocks.get(lockKey);
    if (existing) return existing;

    const promise = this._getOrCreateMachine(options);
    this.creationLocks.set(lockKey, promise);

    try {
      return await promise;
    } finally {
      this.creationLocks.delete(lockKey);
    }
  }

  private async _getOrCreateMachine(options: {
    userId: string;
    orgId: string;
    defaultTool: string;
    userTokens: Record<string, string>;
  }): Promise<CloudMachine> {
    const { userId, orgId, defaultTool, userTokens } = options;

    const existingMachine = await prisma.cloudMachine.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });

    if (existingMachine) {
      this.cancelIdleTimer(existingMachine.id);

      // DB status is a cache — verify against provider unless recently updated.
      // Skip the network round-trip if the machine was touched in the last 30s.
      if (existingMachine.status !== "destroyed") {
        const recentlyUpdated = Date.now() - existingMachine.updatedAt.getTime() < 30_000;
        const vmState = recentlyUpdated ? null : await this.provider.getVMState(existingMachine.providerMachineId);

        // If we checked and the VM is gone/terminal — clean up and recreate
        if (vmState && (vmState === "destroyed" || vmState === "failed")) {
          console.log(`[cloud-machine-service] machine ${existingMachine.id} VM is ${vmState} (DB says ${existingMachine.status}), replacing`);
          await this.cleanupStaleRecord(existingMachine.id, existingMachine.providerMachineId, existingMachine.bridgeToken);
          return this.createMachine({ userId, orgId, defaultTool, userTokens });
        }

        switch (existingMachine.status) {
          case "started":
          case "creating": {
            // Sync DB status with actual VM state if provider says stopped
            if (vmState === "stopped") {
              await this.provider.startVM(existingMachine.providerMachineId);
              return prisma.cloudMachine.update({
                where: { id: existingMachine.id },
                data: { status: "started" },
              });
            }
            return existingMachine;
          }

          case "stopped": {
            await this.provider.startVM(existingMachine.providerMachineId);
            const updated = await prisma.cloudMachine.update({
              where: { id: existingMachine.id },
              data: { status: "started" },
            });
            this.validBridgeTokens.add(updated.bridgeToken);
            return updated;
          }
        }
      }

      // Destroyed — delete the old row and fall through to creation
      await prisma.cloudMachine.delete({ where: { id: existingMachine.id } });
    }

    return this.createMachine({ userId, orgId, defaultTool, userTokens });
  }

  /** Remove a stale CloudMachine record and attempt to clean up the provider VM. */
  private async cleanupStaleRecord(cloudMachineId: string, providerMachineId: string, bridgeToken: string): Promise<void> {
    this.validBridgeTokens.delete(bridgeToken);
    this.cancelIdleTimer(cloudMachineId);

    // Best-effort destroy on provider side
    await this.provider.destroyVM(providerMachineId).catch(() => {});

    await prisma.cloudMachine.delete({ where: { id: cloudMachineId } });
  }

  private async createMachine(options: {
    userId: string;
    orgId: string;
    defaultTool: string;
    userTokens: Record<string, string>;
  }): Promise<CloudMachine> {
    const { userId, orgId, defaultTool, userTokens } = options;
    const bridgeToken = randomUUID();
    const cloudMachineId = randomUUID();
    const runtimeInstanceId = `cloud-machine-${cloudMachineId}`;
    const bridgeUrl = TRACE_SERVER_PUBLIC_URL.replace(/^http/, "ws") + "/bridge";

    // Build env vars for the VM
    const env: Record<string, string> = {};
    if (userTokens.anthropic) env.ANTHROPIC_API_KEY = userTokens.anthropic;
    else if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (userTokens.openai) env.OPENAI_API_KEY = userTokens.openai;
    if (userTokens.github) env.GITHUB_TOKEN = userTokens.github;
    else if (process.env.GITHUB_TOKEN) env.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (userTokens.ssh_key) env.SSH_PRIVATE_KEY = Buffer.from(userTokens.ssh_key).toString("base64");

    const { providerMachineId } = await this.provider.createVM({
      cloudMachineId,
      bridgeToken,
      bridgeUrl,
      defaultTool,
      env,
    });

    const machine = await prisma.cloudMachine.create({
      data: {
        id: cloudMachineId,
        provider: this.providerName,
        providerMachineId,
        userId,
        organizationId: orgId,
        status: "creating",
        bridgeToken,
        runtimeInstanceId,
      },
    });

    this.validBridgeTokens.add(bridgeToken);

    // Track the startup promise so callers can fail fast if the VM dies
    const startupPromise = this.provider.waitForStarted(providerMachineId).then(async () => {
      await prisma.cloudMachine.update({
        where: { id: machine.id },
        data: { status: "started" },
      });
    }).catch(async (err) => {
      console.error(`[cloud-machine-service] VM ${machine.id} failed to start:`, err);
      await prisma.cloudMachine.update({
        where: { id: machine.id },
        data: { status: "destroyed" },
      }).catch(() => {});
      this.validBridgeTokens.delete(bridgeToken);
      throw err; // Re-throw so awaiters see the failure
    }).finally(() => {
      this.startupPromises.delete(cloudMachineId);
    });
    this.startupPromises.set(cloudMachineId, startupPromise);

    return machine;
  }

  /**
   * Get the in-flight startup promise for a machine, if one exists.
   * Callers can race this against their own timeout to fail fast on VM boot failure.
   */
  getStartupPromise(cloudMachineId: string): Promise<void> | undefined {
    return this.startupPromises.get(cloudMachineId);
  }

  /**
   * Called when a session on this machine ends.
   * Checks if any active sessions remain; if not, schedules idle shutdown.
   */
  async sessionEnded(cloudMachineId: string): Promise<void> {
    // Count active sessions bound to this machine's runtime
    const machine = await prisma.cloudMachine.findUnique({ where: { id: cloudMachineId } });
    if (!machine || machine.status === "destroyed") return;

    const activeSessions = await prisma.session.count({
      where: {
        hosting: "cloud",
        agentStatus: { in: ["active", "done"] },
        sessionStatus: { notIn: ["merged"] },
        connection: { path: ["cloudMachineId"], equals: cloudMachineId },
      },
    });

    if (activeSessions === 0) {
      console.log(`[cloud-machine-service] machine ${cloudMachineId} has no active sessions, scheduling idle stop in ${IDLE_TIMEOUT_MS / 1000}s`);
      this.scheduleIdleStop(cloudMachineId);
    }
  }

  /**
   * Stop a machine (preserves filesystem). Called by idle timer or explicitly.
   */
  async stop(cloudMachineId: string): Promise<void> {
    const machine = await prisma.cloudMachine.findUnique({ where: { id: cloudMachineId } });
    if (!machine || machine.status !== "started") return;

    await this.provider.stopVM(machine.providerMachineId);
    await prisma.cloudMachine.update({
      where: { id: cloudMachineId },
      data: { status: "stopped" },
    });
    console.log(`[cloud-machine-service] stopped machine ${cloudMachineId}`);
  }

  /**
   * Destroy a machine permanently.
   */
  async destroy(cloudMachineId: string): Promise<void> {
    this.cancelIdleTimer(cloudMachineId);

    const machine = await prisma.cloudMachine.findUnique({ where: { id: cloudMachineId } });
    if (!machine || machine.status === "destroyed") return;

    this.validBridgeTokens.delete(machine.bridgeToken);

    await this.provider.destroyVM(machine.providerMachineId).catch((err) => {
      console.warn(`[cloud-machine-service] failed to destroy VM ${machine.providerMachineId}:`, err);
    });

    await prisma.cloudMachine.update({
      where: { id: cloudMachineId },
      data: { status: "destroyed" },
    });

    console.log(`[cloud-machine-service] destroyed machine ${cloudMachineId}`);
  }

  /**
   * Validate a bridge token for WebSocket auth.
   */
  async isValidBridgeToken(token: string): Promise<boolean> {
    if (this.validBridgeTokens.has(token)) return true;

    // DB fallback for server restarts
    const machine = await prisma.cloudMachine.findUnique({
      where: { bridgeToken: token },
    });

    if (machine && machine.status !== "destroyed") {
      this.validBridgeTokens.add(token);
      return true;
    }

    return false;
  }

  /**
   * Restore in-memory state from DB on startup.
   * Also checks for started machines with no active sessions and schedules idle stops.
   */
  async restoreFromDb(): Promise<void> {
    const machines = await prisma.cloudMachine.findMany({
      where: { status: { in: ["creating", "started", "stopped"] } },
    });

    for (const machine of machines) {
      this.validBridgeTokens.add(machine.bridgeToken);
    }

    if (machines.length > 0) {
      console.log(`[cloud-machine-service] restored ${machines.length} machine bridge tokens`);
    }

    // Check for started machines with no active sessions (timers lost on restart)
    const startedMachines = machines.filter((m) => m.status === "started");
    for (const machine of startedMachines) {
      const activeSessions = await prisma.session.count({
        where: {
          hosting: "cloud",
          agentStatus: { in: ["active", "done"] },
          sessionStatus: { notIn: ["merged"] },
          connection: { path: ["cloudMachineId"], equals: machine.id },
        },
      });
      if (activeSessions === 0) {
        console.log(`[cloud-machine-service] machine ${machine.id} has no active sessions on restore, scheduling idle stop`);
        this.scheduleIdleStop(machine.id);
      }
    }
  }

  private scheduleIdleStop(cloudMachineId: string): void {
    this.cancelIdleTimer(cloudMachineId);
    const timer = setTimeout(() => {
      this.idleTimers.delete(cloudMachineId);
      this.stop(cloudMachineId).catch((err) => {
        console.error(`[cloud-machine-service] idle stop failed for ${cloudMachineId}:`, err);
      });
    }, IDLE_TIMEOUT_MS);
    this.idleTimers.set(cloudMachineId, timer);
  }

  private cancelIdleTimer(cloudMachineId: string): void {
    const timer = this.idleTimers.get(cloudMachineId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(cloudMachineId);
    }
  }
}
