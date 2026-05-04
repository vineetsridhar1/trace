import type { ControllerConfig } from "./config.js";
import type { FlyMachine, StartSessionRequest } from "./types.js";

const FLY_API_BASE_URL = "https://api.machines.dev";

export class FlyApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "FlyApiError";
    this.status = status;
  }
}

export class FlyMachinesClient {
  constructor(private readonly config: ControllerConfig) {}

  async createRuntimeMachine(
    request: StartSessionRequest,
    idempotencyKey: string | undefined,
  ): Promise<FlyMachine> {
    if (idempotencyKey) {
      const existing = await this.findMachineByIdempotencyKey(idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const body = {
      name: buildMachineName(request.sessionId, request.runtimeInstanceId),
      region: this.config.flyRegion,
      skip_launch: false,
      skip_service_registration: true,
      config: {
        image: this.config.traceRuntimeImage,
        env: buildMachineEnv(request, this.config.runtimePassthroughEnv),
        guest: {
          cpu_kind: this.config.flyMachineCpuKind,
          cpus: this.config.flyMachineCpus,
          memory_mb: this.config.flyMachineMemoryMb,
        },
        metadata: buildMachineMetadata(request, idempotencyKey),
        restart: {
          policy: "no",
        },
      },
    };

    return this.request<FlyMachine>(`/v1/apps/${this.appName()}/machines`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getMachine(machineId: string): Promise<FlyMachine> {
    return this.request<FlyMachine>(
      `/v1/apps/${this.appName()}/machines/${encodeURIComponent(machineId)}`,
      {
        method: "GET",
      },
    );
  }

  async stopMachine(machineId: string): Promise<void> {
    await this.request<unknown>(
      `/v1/apps/${this.appName()}/machines/${encodeURIComponent(machineId)}/stop`,
      {
        method: "POST",
        body: JSON.stringify({
          signal: "SIGTERM",
          timeout: "30s",
        }),
      },
    );
  }

  async deleteMachine(machineId: string): Promise<void> {
    await this.request<unknown>(
      `/v1/apps/${this.appName()}/machines/${encodeURIComponent(machineId)}?force=true`,
      {
        method: "DELETE",
      },
    );
  }

  private async findMachineByIdempotencyKey(idempotencyKey: string): Promise<FlyMachine | null> {
    const machines = await this.request<FlyMachine[]>(
      `/v1/apps/${this.appName()}/machines?metadata.trace_idempotency_key=${encodeURIComponent(
        idempotencyKey,
      )}`,
      { method: "GET" },
    );

    return machines[0] ?? null;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${FLY_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.flyApiToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new FlyApiError(response.status, await buildFlyErrorMessage(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private appName(): string {
    return encodeURIComponent(this.config.flyAppName);
  }
}

export function buildMachineName(sessionId: string, runtimeInstanceId: string): string {
  return `trace-${shortId(sessionId, "session")}-${shortId(runtimeInstanceId, "runtime")}`.toLowerCase();
}

export function buildMachineEnv(
  request: StartSessionRequest,
  passthroughEnv: Record<string, string> = {},
): Record<string, string> {
  return {
    ...passthroughEnv,
    ...request.bootstrapEnv,
    TRACE_TOOL: request.tool,
    TRACE_WORKSPACE_ISOLATION: "per_session_runtime",
    ...(request.model ? { TRACE_MODEL: request.model } : {}),
    ...(request.reasoningEffort ? { TRACE_REASONING_EFFORT: request.reasoningEffort } : {}),
    ...(request.repo
      ? {
          TRACE_REPO_URL: request.repo.remoteUrl,
          TRACE_REPO_BRANCH: request.repo.branch ?? request.repo.defaultBranch,
        }
      : {}),
  };
}

function buildMachineMetadata(
  request: StartSessionRequest,
  idempotencyKey: string | undefined,
): Record<string, string> {
  return {
    trace_session_id: request.sessionId,
    trace_org_id: request.orgId,
    trace_runtime_instance_id: request.runtimeInstanceId,
    trace_environment_id: request.metadata.environmentId,
    trace_requested_by: request.metadata.requestedBy,
    trace_workspace_isolation: "per_session_runtime",
    ...(idempotencyKey ? { trace_idempotency_key: idempotencyKey } : {}),
  };
}

function shortId(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 12)
    .replace(/^-+|-+$/g, "");

  return cleaned || fallback;
}

async function buildFlyErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `Fly API request failed with ${response.status}`;
  }

  return `Fly API request failed with ${response.status}: ${text.slice(0, 500)}`;
}
