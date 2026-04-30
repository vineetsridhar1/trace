import type { SessionStatusRequest, StartSessionRequest, StopSessionRequest } from "./types.js";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function validateStartSessionRequest(body: unknown): StartSessionRequest {
  const value = requireObject(body, "body");
  const repo = value.repo === null ? null : validateRepo(value.repo);
  const bootstrapEnv = validateStringRecord(value.bootstrapEnv, "bootstrapEnv");

  return {
    sessionId: requireString(value.sessionId, "sessionId"),
    sessionGroupId:
      value.sessionGroupId === null ? null : requireString(value.sessionGroupId, "sessionGroupId"),
    orgId: requireString(value.orgId, "orgId"),
    runtimeInstanceId: requireString(value.runtimeInstanceId, "runtimeInstanceId"),
    runtimeToken: requireString(value.runtimeToken, "runtimeToken"),
    runtimeTokenExpiresAt: requireString(value.runtimeTokenExpiresAt, "runtimeTokenExpiresAt"),
    runtimeTokenScope: requireLiteral(value.runtimeTokenScope, "session", "runtimeTokenScope"),
    bridgeUrl: requireString(value.bridgeUrl, "bridgeUrl"),
    repo,
    tool: requireOneOf(value.tool, ["claude_code", "codex"], "tool"),
    model: requireString(value.model, "model"),
    bootstrapEnv,
    metadata: validateMetadata(value.metadata),
  };
}

export function validateStopSessionRequest(body: unknown): StopSessionRequest {
  const value = requireObject(body, "body");

  return {
    sessionId: requireString(value.sessionId, "sessionId"),
    runtimeId: requireString(value.runtimeId, "runtimeId"),
    reason: requireString(value.reason, "reason"),
  };
}

export function validateSessionStatusRequest(body: unknown): SessionStatusRequest {
  const value = requireObject(body, "body");

  return {
    runtimeId: requireString(value.runtimeId, "runtimeId"),
  };
}

function validateRepo(value: unknown): StartSessionRequest["repo"] {
  const repo = requireObject(value, "repo");

  return {
    id: requireString(repo.id, "repo.id"),
    name: requireString(repo.name, "repo.name"),
    remoteUrl: requireString(repo.remoteUrl, "repo.remoteUrl"),
    defaultBranch: requireString(repo.defaultBranch, "repo.defaultBranch"),
    branch: repo.branch === null ? null : requireString(repo.branch, "repo.branch"),
    checkpointSha:
      repo.checkpointSha === null ? null : requireString(repo.checkpointSha, "repo.checkpointSha"),
    readOnly: requireBoolean(repo.readOnly, "repo.readOnly"),
  };
}

function validateMetadata(value: unknown): StartSessionRequest["metadata"] {
  const metadata = requireObject(value, "metadata");
  const launcherMetadata = requireObject(metadata.launcherMetadata, "metadata.launcherMetadata");

  return {
    requestedBy: requireString(metadata.requestedBy, "metadata.requestedBy"),
    environmentId: requireString(metadata.environmentId, "metadata.environmentId"),
    launcherMetadata,
  };
}

function validateStringRecord(value: unknown, path: string): Record<string, string> {
  const record = requireObject(value, path);
  const output: Record<string, string> = {};

  for (const [key, recordValue] of Object.entries(record)) {
    output[key] = requireString(recordValue, `${path}.${key}`);
  }

  return output;
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(`${path} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RequestValidationError(`${path} must be a non-empty string`);
  }

  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new RequestValidationError(`${path} must be a boolean`);
  }

  return value;
}

function requireLiteral<T extends string>(value: unknown, literal: T, path: string): T {
  if (value !== literal) {
    throw new RequestValidationError(`${path} must be ${literal}`);
  }

  return literal;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new RequestValidationError(`${path} must be one of ${allowed.join(", ")}`);
  }

  return value as T;
}
