import { spawn, type ChildProcessByStdio } from "child_process";
import type { Readable } from "stream";
import type { BridgeTunnelActionResultPayload, BridgeTunnelSlot } from "@trace/shared";
import {
  getBridgeTunnelSlots,
  saveBridgeTunnelSlots,
  type BridgeTunnelSlotConfig,
} from "./config.js";
import { runtimeDebug } from "./runtime-debug.js";

interface SlotRuntimeState {
  process: ChildProcessByStdio<null, Readable, Readable> | null;
  state: BridgeTunnelSlot["state"];
  lastError: string | null;
  updatedAt: string;
  signature: string | null;
}

function slotSignature(slot: BridgeTunnelSlotConfig): string {
  return JSON.stringify([
    slot.provider,
    slot.mode,
    slot.publicUrl,
    slot.targetPort,
  ]);
}

function defaultState(slot: BridgeTunnelSlotConfig): BridgeTunnelSlot["state"] {
  return slot.mode === "manual" ? "configured" : "stopped";
}

function tail(text: string, max = 1200): string {
  return text.length <= max ? text : text.slice(-max);
}

function buildSnapshot(
  slot: BridgeTunnelSlotConfig,
  runtimeState: SlotRuntimeState | null | undefined,
): BridgeTunnelSlot {
  return {
    id: slot.id,
    label: slot.label,
    provider: slot.provider,
    mode: slot.mode,
    publicUrl: slot.publicUrl,
    targetPort: slot.targetPort,
    state: runtimeState?.state ?? defaultState(slot),
    lastError: runtimeState?.lastError ?? null,
    updatedAt: runtimeState?.updatedAt ?? slot.updatedAt,
  };
}

function isManagedNgrokSlot(slot: BridgeTunnelSlotConfig): boolean {
  return slot.mode === "trace_managed" && slot.provider === "ngrok";
}

function formatNgrokExitError(
  stderr: string,
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  const trimmed = tail(stderr.trim());
  if (trimmed) return trimmed;
  if (signal) return `ngrok exited with signal ${signal}`;
  return `ngrok exited with code ${code ?? "unknown"}`;
}

export class BridgeTunnelManager {
  private runtimeBySlotId = new Map<string, SlotRuntimeState>();
  private listeners = new Set<(slots: BridgeTunnelSlot[]) => void>();

  subscribe(listener: (slots: BridgeTunnelSlot[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSlotsSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSlotsSnapshot(): BridgeTunnelSlot[] {
    return getBridgeTunnelSlots().map((slot) =>
      buildSnapshot(slot, this.runtimeBySlotId.get(slot.id)),
    );
  }

  async saveSlots(slots: BridgeTunnelSlotConfig[]): Promise<BridgeTunnelSlot[]> {
    await saveBridgeTunnelSlots(slots);
    await this.handleConfigUpdated();
    return this.getSlotsSnapshot();
  }

  async handleConfigUpdated(): Promise<BridgeTunnelSlot[]> {
    const slots = getBridgeTunnelSlots();
    const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
    const removedSlotIds = [...this.runtimeBySlotId.keys()].filter((slotId) => !slotsById.has(slotId));

    for (const slotId of removedSlotIds) {
      const runtimeState = this.runtimeBySlotId.get(slotId);
      if (runtimeState?.process) {
        await this.stopRunningProcess(slotId, runtimeState.process, true);
      }
      this.runtimeBySlotId.delete(slotId);
    }

    for (const slot of slots) {
      const runtimeState = this.runtimeBySlotId.get(slot.id);
      if (!runtimeState?.process) continue;
      if (runtimeState.signature === slotSignature(slot)) continue;
      const shouldRestart = runtimeState.state === "running";
      await this.stopRunningProcess(slot.id, runtimeState.process, true);
      if (shouldRestart && isManagedNgrokSlot(slot) && slot.targetPort) {
        await this.startSlot(slot.id);
      } else {
        const next = this.runtimeBySlotId.get(slot.id);
        if (next) {
          next.signature = slotSignature(slot);
          next.state = defaultState(slot);
          next.lastError = null;
          next.updatedAt = new Date().toISOString();
        }
      }
    }

    this.emit();
    return this.getSlotsSnapshot();
  }

  async startSlot(slotId: string): Promise<BridgeTunnelActionResultPayload> {
    const slot = this.findSlot(slotId);
    if (!slot) {
      return { ok: false, slot: null, error: "Tunnel slot not found." };
    }
    if (!isManagedNgrokSlot(slot)) {
      return {
        ok: false,
        slot: this.getSlotSnapshot(slotId),
        error: "Only managed ngrok slots can be started by Trace.",
      };
    }
    if (!slot.targetPort) {
      return {
        ok: false,
        slot: this.getSlotSnapshot(slotId),
        error: "Managed tunnel slots need a target port before starting.",
      };
    }

    try {
      new URL(slot.publicUrl);
    } catch {
      return {
        ok: false,
        slot: this.getSlotSnapshot(slotId),
        error: "Tunnel public URL must be a valid absolute URL.",
      };
    }

    const existing = this.runtimeBySlotId.get(slotId);
    if (existing?.process) {
      await this.stopRunningProcess(slotId, existing.process, true);
    }

    const now = new Date().toISOString();
    const child = spawn("ngrok", ["http", String(slot.targetPort), `--url=${slot.publicUrl}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = tail(stderr + chunk.toString("utf-8"));
    });

    const runtimeState: SlotRuntimeState = {
      process: child,
      state: "running",
      lastError: null,
      updatedAt: now,
      signature: slotSignature(slot),
    };
    this.runtimeBySlotId.set(slotId, runtimeState);
    this.emit();

    runtimeDebug("bridge tunnel start requested", {
      slotId,
      provider: slot.provider,
      mode: slot.mode,
      publicUrl: slot.publicUrl,
      targetPort: slot.targetPort,
    });

    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      const current = this.runtimeBySlotId.get(slotId);
      if (!current || current.process !== child) return;
      current.process = null;
      current.updatedAt = new Date().toISOString();
      if (current.state === "stopped") {
        current.lastError = null;
      } else if (code === 0 || signal === "SIGTERM" || signal === "SIGKILL") {
        current.state = "stopped";
        current.lastError = null;
      } else {
        current.state = "error";
        current.lastError = formatNgrokExitError(stderr, code, signal);
      }
      this.emit();
    });

    return new Promise<BridgeTunnelActionResultPayload>((resolve) => {
      let settled = false;

      const finish = (payload: BridgeTunnelActionResultPayload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };

      const startupTimer = setTimeout(() => {
        finish({
          ok: true,
          slot: this.getSlotSnapshot(slotId),
          error: null,
        });
      }, 1500);

      child.once("error", (error: Error) => {
        clearTimeout(startupTimer);
        const current = this.runtimeBySlotId.get(slotId);
        if (current && current.process === child) {
          current.process = null;
          current.state = "error";
          current.lastError = error.message;
          current.updatedAt = new Date().toISOString();
          this.emit();
        }
        finish({
          ok: false,
          slot: this.getSlotSnapshot(slotId),
          error: error.message,
        });
      });

      child.once("exit", () => {
        clearTimeout(startupTimer);
        const snapshot = this.getSlotSnapshot(slotId);
        finish({
          ok: false,
          slot: snapshot,
          error: snapshot?.lastError ?? "ngrok exited before the tunnel was ready.",
        });
      });
    });
  }

  async stopSlot(slotId: string): Promise<BridgeTunnelActionResultPayload> {
    const slot = this.findSlot(slotId);
    if (!slot) {
      return { ok: false, slot: null, error: "Tunnel slot not found." };
    }
    if (!isManagedNgrokSlot(slot)) {
      return {
        ok: false,
        slot: this.getSlotSnapshot(slotId),
        error: "Only managed ngrok slots can be stopped by Trace.",
      };
    }

    const runtimeState = this.runtimeBySlotId.get(slotId);
    if (runtimeState?.process) {
      await this.stopRunningProcess(slotId, runtimeState.process, false);
    } else {
      this.runtimeBySlotId.set(slotId, {
        process: null,
        state: "stopped",
        lastError: null,
        updatedAt: new Date().toISOString(),
        signature: slotSignature(slot),
      });
      this.emit();
    }

    return {
      ok: true,
      slot: this.getSlotSnapshot(slotId),
      error: null,
    };
  }

  async retargetSlot(
    slotId: string,
    targetPort: number,
  ): Promise<BridgeTunnelActionResultPayload> {
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      return { ok: false, slot: null, error: "Target port must be between 1 and 65535." };
    }

    const slots = getBridgeTunnelSlots();
    const nextSlots = slots.map((slot) =>
      slot.id === slotId ? { ...slot, targetPort } : slot,
    );
    if (!nextSlots.some((slot) => slot.id === slotId)) {
      return { ok: false, slot: null, error: "Tunnel slot not found." };
    }

    const wasRunning = !!this.runtimeBySlotId.get(slotId)?.process;
    await saveBridgeTunnelSlots(nextSlots);

    if (wasRunning) {
      return this.startSlot(slotId);
    }

    const slot = this.findSlot(slotId);
    if (slot) {
      this.runtimeBySlotId.set(slotId, {
        process: null,
        state: defaultState(slot),
        lastError: null,
        updatedAt: new Date().toISOString(),
        signature: slotSignature(slot),
      });
    }
    this.emit();

    return {
      ok: true,
      slot: this.getSlotSnapshot(slotId),
      error: null,
    };
  }

  private async stopRunningProcess(
    slotId: string,
    child: ChildProcessByStdio<null, Readable, Readable>,
    preserveStoppedState: boolean,
  ): Promise<void> {
    const current = this.runtimeBySlotId.get(slotId);
    if (current && current.process === child) {
      current.state = "stopped";
      current.lastError = null;
      current.updatedAt = new Date().toISOString();
      this.emit();
    }

    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      child.once("exit", () => {
        const latest = this.runtimeBySlotId.get(slotId);
        if (latest && latest.process === child) {
          latest.process = null;
          latest.state = preserveStoppedState ? latest.state : "stopped";
          latest.lastError = null;
          latest.updatedAt = new Date().toISOString();
        }
        this.emit();
        done();
      });

      child.kill("SIGTERM");
      setTimeout(() => {
        if (!finished) child.kill("SIGKILL");
      }, 1500);
      setTimeout(done, 2500);
    });
  }

  private findSlot(slotId: string): BridgeTunnelSlotConfig | null {
    return getBridgeTunnelSlots().find((slot) => slot.id === slotId) ?? null;
  }

  private getSlotSnapshot(slotId: string): BridgeTunnelSlot | null {
    const slot = this.findSlot(slotId);
    return slot ? buildSnapshot(slot, this.runtimeBySlotId.get(slotId)) : null;
  }

  private emit(): void {
    const snapshot = this.getSlotsSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
