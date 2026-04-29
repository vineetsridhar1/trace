import type { CloudMachineService } from "./cloud-machine-service.js";
import {
  RuntimeAdapterRegistry,
  type RuntimeAdapter,
  type RuntimeStartInput,
  type RuntimeStartResult,
  type RuntimeStatusResult,
  type RuntimeStopInput,
  type RuntimeStopResult,
} from "./runtime-adapter-registry.js";
import { apiTokenService } from "../services/api-token.js";

const CODING_TOOLS = new Set(["claude_code", "codex", "custom"]);

function getCapabilities(config: Record<string, unknown>): Record<string, unknown> | null {
  const capabilities = config.capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return null;
  return capabilities as Record<string, unknown>;
}

function assertCompatibilityConstraints(config: Record<string, unknown>): void {
  const capabilities = getCapabilities(config);
  const supportedTools = capabilities?.supportedTools;
  if (supportedTools !== undefined) {
    if (!Array.isArray(supportedTools)) {
      throw new Error("Agent environment capabilities.supportedTools must be an array");
    }
    for (const tool of supportedTools) {
      if (typeof tool !== "string" || !CODING_TOOLS.has(tool)) {
        throw new Error(
          "Agent environment capabilities.supportedTools contains an unsupported tool",
        );
      }
    }
  }

  const startupTimeoutSeconds = config.startupTimeoutSeconds;
  if (
    startupTimeoutSeconds !== undefined &&
    (typeof startupTimeoutSeconds !== "number" ||
      !Number.isInteger(startupTimeoutSeconds) ||
      startupTimeoutSeconds < 1)
  ) {
    throw new Error("Agent environment startupTimeoutSeconds must be a positive integer");
  }
}

class LocalRuntimeAdapter implements RuntimeAdapter {
  readonly type = "local" as const;

  async validateConfig(config: Record<string, unknown>): Promise<void> {
    assertCompatibilityConstraints(config);
    const runtimeInstanceId = config.runtimeInstanceId;
    if (runtimeInstanceId !== undefined && typeof runtimeInstanceId !== "string") {
      throw new Error("Local agent environment runtimeInstanceId must be a string");
    }
    const runtimeSelection = config.runtimeSelection;
    if (runtimeSelection !== undefined && runtimeSelection !== "any_accessible_local") {
      throw new Error("Local agent environment runtimeSelection must be any_accessible_local");
    }
    if (runtimeInstanceId !== undefined && runtimeSelection !== undefined) {
      throw new Error(
        "Local agent environment config cannot set both runtimeInstanceId and runtimeSelection",
      );
    }
  }

  async testConfig(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Local environment config is valid" };
  }

  async startSession(): Promise<RuntimeStartResult> {
    return {
      status: "selected",
    };
  }

  async stopSession(): Promise<RuntimeStopResult> {
    return { ok: true, status: "stopped" };
  }

  async getStatus(): Promise<RuntimeStatusResult> {
    return { status: "unknown" };
  }
}

/**
 * Transitional compatibility adapter: keeps existing CloudMachine-backed cloud
 * sessions working until ticket 06 replaces this with the generic launcher
 * start/stop/status endpoint implementation.
 */
class LegacyCloudMachineProvisionedRuntimeAdapter implements RuntimeAdapter {
  readonly type = "provisioned" as const;

  constructor(private cloudMachineService: CloudMachineService | null = null) {}

  setCloudMachineService(service: CloudMachineService): void {
    this.cloudMachineService = service;
  }

  async validateConfig(config: Record<string, unknown>): Promise<void> {
    assertCompatibilityConstraints(config);
    for (const key of ["startUrl", "stopUrl", "statusUrl"]) {
      const value = config[key];
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Provisioned agent environment config requires ${key}`);
      }
      try {
        new URL(value);
      } catch {
        throw new Error(`Provisioned agent environment ${key} must be a valid URL`);
      }
    }
  }

  async testConfig(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: "Provisioned environment testing requires runtime adapter connectivity",
    };
  }

  async startSession(input: RuntimeStartInput): Promise<RuntimeStartResult> {
    if (!this.cloudMachineService) {
      throw new Error("Provisioned runtime adapter is not initialized");
    }
    const userTokens = await apiTokenService.getDecryptedTokens(input.actorId);
    const machine = await this.cloudMachineService.getOrCreateMachine({
      userId: input.actorId,
      orgId: input.organizationId,
      defaultTool: input.tool,
      userTokens: userTokens as Record<string, string>,
    });
    return {
      runtimeInstanceId: machine.runtimeInstanceId,
      providerRuntimeId: machine.id,
      status: "connecting",
    };
  }

  async stopSession(input: RuntimeStopInput): Promise<RuntimeStopResult> {
    if (!this.cloudMachineService) {
      return {
        ok: false,
        status: "unsupported",
        message: "Provisioned runtime adapter is not initialized",
      };
    }
    const cloudMachineId = input.connection?.cloudMachineId;
    if (typeof cloudMachineId !== "string" || !cloudMachineId.trim()) {
      return { ok: true, status: "not_found" };
    }
    await this.cloudMachineService.sessionEnded(cloudMachineId).catch((err: Error) => {
      console.warn(
        `[provisioned-adapter] sessionEnded failed for runtime ${cloudMachineId}:`,
        err.message,
      );
    });
    return { ok: true, status: "stopping" };
  }

  async getStatus(): Promise<RuntimeStatusResult> {
    return { status: "unknown" };
  }
}

const provisionedRuntimeAdapter = new LegacyCloudMachineProvisionedRuntimeAdapter();

export function setProvisionedRuntimeCloudMachineService(service: CloudMachineService): void {
  provisionedRuntimeAdapter.setCloudMachineService(service);
}

export const runtimeAdapterRegistry = new RuntimeAdapterRegistry([
  new LocalRuntimeAdapter(),
  provisionedRuntimeAdapter,
]);
