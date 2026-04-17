export type DbctlRuntimeKind = "local" | "cloud";

export type SessionDatabaseStatus =
  | "disabled"
  | "preparing"
  | "ready"
  | "recovering"
  | "failed";

export type DbctlFramework =
  | "prisma"
  | "drizzle"
  | "sequelize"
  | "active_record"
  | "django"
  | "sqlalchemy"
  | "entity_framework_core"
  | "hibernate";

export interface SessionDatabaseInfo {
  enabled: boolean;
  status: SessionDatabaseStatus;
  framework?: DbctlFramework | null;
  databaseName?: string | null;
  port?: number | null;
  lastError?: string | null;
  canReset?: boolean;
  updatedAt?: string | null;
}

export interface DbctlEnsureRequest {
  kind: "ensure";
  runtime: DbctlRuntimeKind;
  worktreePath: string;
  repoId?: string;
  repoRoot?: string;
}

export interface DbctlResetRequest {
  kind: "reset";
  runtime: DbctlRuntimeKind;
  worktreePath: string;
  repoId?: string;
  repoRoot?: string;
}

export interface DbctlDestroyRequest {
  kind: "destroy";
  worktreePath: string;
}

export interface DbctlLogsRequest {
  kind: "logs";
  worktreePath: string;
  lines?: number;
}

export interface DbctlPsqlRequest {
  kind: "psql";
  worktreePath: string;
  extraArgs?: string[];
}

export interface DbctlGcRequest {
  kind: "gc";
}

export interface DbctlStatusRequest {
  kind: "status";
  worktreePath: string;
}

export type DbctlRequest =
  | DbctlEnsureRequest
  | DbctlResetRequest
  | DbctlDestroyRequest
  | DbctlLogsRequest
  | DbctlPsqlRequest
  | DbctlGcRequest
  | DbctlStatusRequest;

export interface DbctlOkResponse {
  ok: true;
  database: SessionDatabaseInfo;
  env?: Record<string, string>;
  logs?: string;
  instanceId?: string;
  warning?: string;
}

export interface DbctlErrorResponse {
  ok: false;
  error: string;
  database?: SessionDatabaseInfo;
}

export type DbctlResponse = DbctlOkResponse | DbctlErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isStatus(value: unknown): value is SessionDatabaseStatus {
  return (
    value === "disabled" ||
    value === "preparing" ||
    value === "ready" ||
    value === "recovering" ||
    value === "failed"
  );
}

export function isDbctlRequest(value: unknown): value is DbctlRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "ensure":
    case "reset":
      return (
        (value.runtime === "local" || value.runtime === "cloud") &&
        typeof value.worktreePath === "string"
      );
    case "destroy":
    case "status":
      return typeof value.worktreePath === "string";
    case "logs":
      return (
        typeof value.worktreePath === "string" &&
        (value.lines === undefined || typeof value.lines === "number")
      );
    case "psql":
      return (
        typeof value.worktreePath === "string" &&
        (value.extraArgs === undefined ||
          (Array.isArray(value.extraArgs) &&
            value.extraArgs.every((item) => typeof item === "string")))
      );
    case "gc":
      return true;
    default:
      return false;
  }
}

export function isSessionDatabaseInfo(value: unknown): value is SessionDatabaseInfo {
  if (!isRecord(value) || typeof value.enabled !== "boolean" || !isStatus(value.status)) {
    return false;
  }
  if (value.framework !== undefined && value.framework !== null && typeof value.framework !== "string") {
    return false;
  }
  if (value.databaseName !== undefined && value.databaseName !== null && typeof value.databaseName !== "string") {
    return false;
  }
  if (value.port !== undefined && value.port !== null && typeof value.port !== "number") {
    return false;
  }
  if (value.lastError !== undefined && value.lastError !== null && typeof value.lastError !== "string") {
    return false;
  }
  if (value.canReset !== undefined && typeof value.canReset !== "boolean") {
    return false;
  }
  if (value.updatedAt !== undefined && value.updatedAt !== null && typeof value.updatedAt !== "string") {
    return false;
  }
  return true;
}

export function isDbctlResponse(value: unknown): value is DbctlResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) {
    if (!isSessionDatabaseInfo(value.database)) return false;
    if (
      value.env !== undefined &&
      (!isRecord(value.env) ||
        Object.values(value.env).some((item) => typeof item !== "string"))
    ) {
      return false;
    }
    if (value.logs !== undefined && typeof value.logs !== "string") return false;
    if (value.instanceId !== undefined && typeof value.instanceId !== "string") return false;
    if (value.warning !== undefined && typeof value.warning !== "string") return false;
    return true;
  }
  return typeof value.error === "string";
}
