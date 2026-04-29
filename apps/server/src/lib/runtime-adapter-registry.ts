import { Prisma } from "@prisma/client";

export type RuntimeAdapterType = "local" | "provisioned";

export type RuntimeStartInput = {
  sessionId: string;
  sessionGroupId?: string;
  slug?: string;
  preserveBranchName?: boolean;
  organizationId: string;
  actorId: string;
  environment?: {
    id: string;
    name: string;
    adapterType: RuntimeAdapterType;
    config: Prisma.JsonValue;
  } | null;
  tool: string;
  model?: string;
  repo?: { id: string; name: string; remoteUrl: string; defaultBranch: string } | null;
  branch?: string;
  checkpointSha?: string;
  readOnly?: boolean;
  runtimeToken?: string;
  bridgeUrl?: string;
};

export type RuntimeStartResult = {
  runtimeInstanceId?: string;
  runtimeLabel?: string;
  providerRuntimeId?: string;
  providerRuntimeUrl?: string;
  status: "selected" | "provisioning" | "booting" | "connecting" | "connected";
  metadata?: Record<string, unknown>;
};

export type RuntimeStopInput = {
  sessionId: string;
  organizationId?: string;
  actorId?: string;
  connection?: Record<string, unknown> | null;
  reason?: string;
};

export type RuntimeStopResult = {
  ok: boolean;
  status: "stopping" | "stopped" | "not_found" | "unsupported";
  message?: string;
};

export type RuntimeStatusInput = {
  organizationId: string;
  connection?: Record<string, unknown> | null;
};

export type RuntimeStatusResult = {
  status:
    | "unknown"
    | "provisioning"
    | "booting"
    | "connecting"
    | "connected"
    | "stopping"
    | "stopped"
    | "failed";
  message?: string;
  metadata?: Record<string, unknown>;
};

export interface RuntimeAdapter {
  type: RuntimeAdapterType;
  validateConfig(config: Record<string, unknown>): Promise<void>;
  testConfig(input: {
    organizationId: string;
    config: Record<string, unknown>;
  }): Promise<{ ok: boolean; message?: string | null }>;
  startSession(input: RuntimeStartInput): Promise<RuntimeStartResult>;
  stopSession(input: RuntimeStopInput): Promise<RuntimeStopResult>;
  getStatus(input: RuntimeStatusInput): Promise<RuntimeStatusResult>;
}

export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<RuntimeAdapterType, RuntimeAdapter>();

  constructor(adapters: RuntimeAdapter[]) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.type, adapter);
    }
  }

  get(type: string): RuntimeAdapter {
    if (type !== "local" && type !== "provisioned") {
      throw new Error(`Unsupported runtime adapter: ${type}`);
    }
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`Unsupported runtime adapter: ${type}`);
    return adapter;
  }
}
