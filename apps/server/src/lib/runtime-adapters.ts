import { createHmac, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import {
  RuntimeAdapterRegistry,
  type RuntimeAdapter,
  type RuntimeStartInput,
  type RuntimeStartResult,
  type RuntimeStatusResult,
  type RuntimeStatusInput,
  type RuntimeStopInput,
  type RuntimeStopResult,
  type RuntimeEnvironment,
} from "./runtime-adapter-registry.js";
import { orgSecretService } from "../services/org-secret.js";
import { resolveJwtSecret } from "./jwt-secret.js";
import { isLocalMode } from "./mode.js";
import { logAgentEnvironmentTelemetry } from "./agent-environment-telemetry.js";

const CODING_TOOLS = new Set(["claude_code", "codex", "custom"]);
const PROVISIONED_DEPROVISION_POLICIES = new Set(["on_session_end", "manual"]);
const PROVISIONED_STATUS_VALUES = new Set([
  "unknown",
  "provisioning",
  "booting",
  "connecting",
  "connected",
  "stopping",
  "stopped",
  "failed",
]);
const PROVISIONED_STOP_STATUS_VALUES = new Set([
  "stopping",
  "stopped",
  "not_found",
  "unsupported",
]);
const RUNTIME_TOKEN_TTL_SECONDS = 15 * 60;
const RUNTIME_TOKEN_TTL_MS = RUNTIME_TOKEN_TTL_SECONDS * 1000;
const JWT_SECRET = resolveJwtSecret();

type ProvisionedAuthConfig = {
  type: "bearer" | "hmac";
  secretId: string;
};

type ProvisionedConfig = {
  startUrl: string;
  stopUrl: string;
  statusUrl: string;
  auth: ProvisionedAuthConfig;
  startupTimeoutSeconds: number;
  deprovisionPolicy: "on_session_end" | "manual";
  launcherMetadata?: Record<string, unknown>;
};

type ProvisionedRuntimeTokenAuth = {
  instanceId: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  environmentId: string;
  allowedScope: "session";
  tool: string;
};

type ProvisionedRuntimeTokenPayload = ProvisionedRuntimeTokenAuth & {
  tokenType: "provisioned_runtime";
};

export function authenticateProvisionedRuntimeToken(
  token: string,
): ProvisionedRuntimeTokenAuth | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as ProvisionedRuntimeTokenPayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "provisioned_runtime" ||
      typeof payload.instanceId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.environmentId !== "string" ||
      payload.allowedScope !== "session" ||
      typeof payload.tool !== "string"
    ) {
      return null;
    }

    return {
      instanceId: payload.instanceId,
      organizationId: payload.organizationId,
      userId: payload.userId,
      sessionId: payload.sessionId,
      environmentId: payload.environmentId,
      allowedScope: payload.allowedScope,
      tool: payload.tool,
    };
  } catch {
    return null;
  }
}

function createProvisionedRuntimeToken(auth: ProvisionedRuntimeTokenAuth): {
  token: string;
  expiresAt: Date;
} {
  const expiresAt = new Date(Date.now() + RUNTIME_TOKEN_TTL_MS);
  const token = jwt.sign(
    {
      ...auth,
      tokenType: "provisioned_runtime",
    } satisfies ProvisionedRuntimeTokenPayload,
    JWT_SECRET,
    { expiresIn: RUNTIME_TOKEN_TTL_SECONDS },
  );
  return { token, expiresAt };
}

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

function assertHttpsUrl(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Provisioned agent environment config requires ${key}`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Provisioned agent environment ${key} must be a valid URL`);
  }
  if (url.protocol === "http:" && isDevelopmentLoopbackUrl(url)) {
    return value;
  }
  if (url.protocol !== "https:") {
    throw new Error(`Provisioned agent environment ${key} must use HTTPS`);
  }
  return value;
}

function isDevelopmentLoopbackUrl(url: URL): boolean {
  if (process.env.NODE_ENV === "production" && !isLocalMode()) return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

function assertProvisionedAuthConfig(value: unknown): ProvisionedAuthConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Provisioned agent environment config requires auth");
  }
  const auth = value as Record<string, unknown>;
  if (auth.type !== "bearer" && auth.type !== "hmac") {
    throw new Error("Provisioned agent environment auth.type must be bearer or hmac");
  }
  if (typeof auth.secretId !== "string" || !auth.secretId.trim()) {
    throw new Error("Provisioned agent environment auth.secretId must be a non-empty string");
  }
  return { type: auth.type, secretId: auth.secretId };
}

function parseProvisionedConfig(config: Record<string, unknown>): ProvisionedConfig {
  assertCompatibilityConstraints(config);

  const startupTimeoutSeconds = config.startupTimeoutSeconds;
  if (
    typeof startupTimeoutSeconds !== "number" ||
    !Number.isInteger(startupTimeoutSeconds) ||
    startupTimeoutSeconds < 1
  ) {
    throw new Error("Provisioned agent environment startupTimeoutSeconds must be a positive integer");
  }

  const deprovisionPolicy = config.deprovisionPolicy;
  if (
    typeof deprovisionPolicy !== "string" ||
    !PROVISIONED_DEPROVISION_POLICIES.has(deprovisionPolicy)
  ) {
    throw new Error(
      "Provisioned agent environment deprovisionPolicy must be on_session_end or manual",
    );
  }

  const launcherMetadata = config.launcherMetadata;
  if (
    launcherMetadata !== undefined &&
    (!launcherMetadata || typeof launcherMetadata !== "object" || Array.isArray(launcherMetadata))
  ) {
    throw new Error("Provisioned agent environment launcherMetadata must be an object");
  }

  const normalizedDeprovisionPolicy = deprovisionPolicy as ProvisionedConfig["deprovisionPolicy"];

  return {
    startUrl: assertHttpsUrl(config.startUrl, "startUrl"),
    stopUrl: assertHttpsUrl(config.stopUrl, "stopUrl"),
    statusUrl: assertHttpsUrl(config.statusUrl, "statusUrl"),
    auth: assertProvisionedAuthConfig(config.auth),
    startupTimeoutSeconds,
    deprovisionPolicy: normalizedDeprovisionPolicy,
    ...(launcherMetadata !== undefined
      ? { launcherMetadata: launcherMetadata as Record<string, unknown> }
      : {}),
  };
}

function configRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Runtime environment config must be an object");
  }
  return value as Record<string, unknown>;
}

function defaultBridgeUrl(): string {
  const publicUrl = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (!publicUrl) throw new Error("TRACE_SERVER_PUBLIC_URL is required for provisioned runtimes");
  return publicUrl.replace(/^http/, "ws") + "/bridge";
}

function responseRecord(value: unknown, endpointName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Provisioned ${endpointName} response must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function traceStatus(value: unknown): RuntimeStatusResult["status"] {
  if (typeof value !== "string") return "unknown";
  if (PROVISIONED_STATUS_VALUES.has(value)) return value as RuntimeStatusResult["status"];
  if (value === "running") return "connected";
  if (value === "pending" || value === "starting") return "provisioning";
  if (value === "terminated" || value === "complete") return "stopped";
  return "unknown";
}

function stopStatus(value: unknown): RuntimeStopResult["status"] {
  if (typeof value === "string" && PROVISIONED_STOP_STATUS_VALUES.has(value)) {
    return value as RuntimeStopResult["status"];
  }
  return "stopping";
}

function startStatus(value: unknown): RuntimeStartResult["status"] {
  const status = traceStatus(value);
  if (
    status === "booting" ||
    status === "connecting" ||
    status === "connected" ||
    status === "provisioning"
  ) {
    return status;
  }
  return "provisioning";
}

function idempotencyKey(sessionId: string, action: "start" | "stop"): string {
  return `session:${sessionId}:${action}`;
}

/**
 * Error thrown by the provisioned launcher request layer. Carries enough
 * context for retry logic to decide whether to back off or give up.
 *
 * `retryable` is computed from the HTTP status: 5xx, 408 (request timeout),
 * 425 (too early), and 429 (throttle) are retryable; other 4xx are
 * permanent (auth/validation/permission failures retry won't fix).
 * Network/parse failures (no `status`) are retryable.
 */
export class ProvisionedLauncherError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProvisionedLauncherError";
    this.status = status;
    this.retryable = isRetryableLauncherStatus(status);
  }
}

function isRetryableLauncherStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status >= 500) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  return false;
}

async function readJsonResponse(response: Response, endpointName: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new ProvisionedLauncherError(
      `Provisioned ${endpointName} request failed (${response.status}): ${text.slice(0, 500)}`,
      response.status,
    );
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProvisionedLauncherError(
      `Provisioned ${endpointName} response was not valid JSON`,
    );
  }
}

async function authenticatedLauncherRequest(params: {
  organizationId: string;
  url: string;
  auth: ProvisionedAuthConfig;
  body: Record<string, unknown>;
  idempotencyKey?: string;
  endpointName: string;
}): Promise<unknown> {
  const secret = await orgSecretService.getDecryptedValue(
    params.organizationId,
    params.auth.secretId,
  );
  if (!secret) {
    throw new Error("Provisioned agent environment auth secret was not found");
  }

  const rawBody = JSON.stringify(params.body);
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Trace-Request-Id": requestId,
    ...(params.idempotencyKey ? { "Trace-Idempotency-Key": params.idempotencyKey } : {}),
  };

  if (params.auth.type === "bearer") {
    headers.Authorization = `Bearer ${secret}`;
  } else {
    const timestamp = new Date().toISOString();
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${requestId}.${rawBody}`)
      .digest("hex");
    headers["Trace-Timestamp"] = timestamp;
    headers["Trace-Signature"] = `v1=${signature}`;
  }

  let response: Response;
  const startedAt = Date.now();
  try {
    response = await fetch(params.url, {
      method: "POST",
      headers,
      body: rawBody,
    });
  } catch (err) {
    // Network-level failure (DNS, TCP reset, etc.) — retryable. Wrap so the
    // adapter caller sees a uniform error type.
    const message = err instanceof Error ? err.message : String(err);
    throw new ProvisionedLauncherError(
      `Provisioned ${params.endpointName} request failed: ${message}`,
    );
  }
  logAgentEnvironmentTelemetry("launcher.request", {
    organizationId: params.organizationId,
    endpointName: params.endpointName,
    status: response.status,
    ok: response.ok,
    latencyMs: Date.now() - startedAt,
    idempotencyKey: params.idempotencyKey,
  });
  return readJsonResponse(response, params.endpointName);
}

class LocalRuntimeAdapter implements RuntimeAdapter {
  readonly type = "local" as const;

  async validateConfig(config: Record<string, unknown>): Promise<void> {
    assertCompatibilityConstraints(config);
    const runtimeInstanceId = config.runtimeInstanceId;
    if (
      runtimeInstanceId !== undefined &&
      (typeof runtimeInstanceId !== "string" || !runtimeInstanceId.trim())
    ) {
      throw new Error("Local agent environment runtimeInstanceId must be a non-empty string");
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

export class ProvisionedRuntimeAdapter implements RuntimeAdapter {
  readonly type = "provisioned" as const;

  async validateConfig(config: Record<string, unknown>): Promise<void> {
    parseProvisionedConfig(config);
  }

  async testConfig(input: {
    organizationId: string;
    config: Record<string, unknown>;
  }): Promise<{ ok: boolean; message: string }> {
    const config = parseProvisionedConfig(input.config);
    const result = await this.getStatus({
      organizationId: input.organizationId,
      environment: {
        id: "config-test",
        name: "Config test",
        adapterType: "provisioned",
        config: input.config as RuntimeEnvironment["config"],
      },
      connection: { providerRuntimeId: "config-test" },
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "failed" as const, message };
    });
    return {
      ok: result.status !== "failed",
      message:
        result.message ??
        `Provisioned environment ${config.statusUrl} responded with ${result.status}`,
    };
  }

  async startSession(input: RuntimeStartInput): Promise<RuntimeStartResult> {
    if (!input.environment) {
      throw new Error("Provisioned runtime requires an agent environment");
    }
    const config = parseProvisionedConfig(configRecord(input.environment.config));
    const runtimeInstanceId = input.runtimeInstanceId ?? `runtime_${randomUUID()}`;
    const runtimeToken = createProvisionedRuntimeToken({
      instanceId: runtimeInstanceId,
      organizationId: input.organizationId,
      userId: input.actorId,
      sessionId: input.sessionId,
      environmentId: input.environment.id,
      allowedScope: "session",
      tool: input.tool,
    });
    const bridgeUrl = input.bridgeUrl ?? defaultBridgeUrl();

    const body = {
      sessionId: input.sessionId,
      sessionGroupId: input.sessionGroupId ?? null,
      orgId: input.organizationId,
      runtimeInstanceId,
      runtimeToken: runtimeToken.token,
      runtimeTokenExpiresAt: runtimeToken.expiresAt.toISOString(),
      runtimeTokenScope: "session",
      bridgeUrl,
      repo: input.repo
        ? {
            ...input.repo,
            branch: input.branch ?? null,
            checkpointSha: input.checkpointSha ?? null,
            readOnly: input.readOnly ?? false,
          }
        : null,
      tool: input.tool,
      model: input.model ?? null,
      bootstrapEnv: {
        TRACE_SESSION_ID: input.sessionId,
        TRACE_ORG_ID: input.organizationId,
        TRACE_RUNTIME_INSTANCE_ID: runtimeInstanceId,
        TRACE_RUNTIME_TOKEN: runtimeToken.token,
        TRACE_BRIDGE_URL: bridgeUrl,
      },
      metadata: {
        requestedBy: input.actorId,
        environmentId: input.environment.id,
        launcherMetadata: config.launcherMetadata ?? null,
      },
    };

    const startedAt = Date.now();
    const json = await authenticatedLauncherRequest({
      organizationId: input.organizationId,
      url: config.startUrl,
      auth: config.auth,
      body,
      idempotencyKey: idempotencyKey(input.sessionId, "start"),
      endpointName: "start",
    });
    const record = responseRecord(json, "start");
    const providerRuntimeId = optionalString(record.runtimeId);
    if (!providerRuntimeId) {
      throw new Error("Provisioned start response requires runtimeId");
    }

    logAgentEnvironmentTelemetry("provisioned.start", {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      environmentId: input.environment.id,
      runtimeInstanceId,
      providerRuntimeId,
      providerStatus: startStatus(record.status),
      latencyMs: Date.now() - startedAt,
    });

    return {
      runtimeInstanceId,
      runtimeLabel: optionalString(record.label),
      providerRuntimeId,
      providerRuntimeUrl: optionalString(record.runtimeUrl),
      status: startStatus(record.status),
    };
  }

  async stopSession(input: RuntimeStopInput): Promise<RuntimeStopResult> {
    if (!input.environment || !input.organizationId) {
      return {
        ok: false,
        status: "unsupported",
        message: "Provisioned runtime environment missing",
      };
    }
    const config = parseProvisionedConfig(configRecord(input.environment.config));
    const providerRuntimeId =
      optionalString(input.connection?.providerRuntimeId) ??
      optionalString(input.connection?.cloudMachineId);
    if (!providerRuntimeId) {
      return { ok: true, status: "not_found" };
    }
    const json = await authenticatedLauncherRequest({
      organizationId: input.organizationId,
      url: config.stopUrl,
      auth: config.auth,
      body: {
        sessionId: input.sessionId,
        runtimeId: providerRuntimeId,
        reason: input.reason ?? "session_stopped",
      },
      idempotencyKey: idempotencyKey(input.sessionId, "stop"),
      endpointName: "stop",
    });
    const record = responseRecord(json, "stop");
    const ok = record.ok === undefined ? true : record.ok === true;
    return {
      ok,
      status: stopStatus(record.status),
      message: optionalString(record.message),
    };
  }

  async getStatus(input: RuntimeStatusInput): Promise<RuntimeStatusResult> {
    if (!input.environment) {
      return { status: "unknown", message: "Provisioned runtime environment missing" };
    }
    const config = parseProvisionedConfig(configRecord(input.environment.config));
    const providerRuntimeId =
      optionalString(input.connection?.providerRuntimeId) ??
      optionalString(input.connection?.cloudMachineId);
    if (!providerRuntimeId) return { status: "unknown", message: "Provider runtime ID missing" };

    const json = await authenticatedLauncherRequest({
      organizationId: input.organizationId,
      url: config.statusUrl,
      auth: config.auth,
      body: {
        runtimeId: providerRuntimeId,
      },
      endpointName: "status",
    });
    const record = responseRecord(json, "status");
    return {
      status: traceStatus(record.status),
      message: optionalString(record.message),
      metadata:
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, unknown>)
          : undefined,
    };
  }
}

const provisionedRuntimeAdapter = new ProvisionedRuntimeAdapter();

export const runtimeAdapterRegistry = new RuntimeAdapterRegistry([
  new LocalRuntimeAdapter(),
  provisionedRuntimeAdapter,
]);
