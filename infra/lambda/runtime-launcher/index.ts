import { createHash, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
  type KeyValuePair,
  type Tag,
} from "@aws-sdk/client-ecs";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

const ecs = new ECSClient({});
const secrets = new SecretsManagerClient({});

const clusterArn = requiredEnv("CLUSTER_ARN");
const taskDefinitionArn = requiredEnv("TASK_DEFINITION_ARN");
const taskExecutionRoleArn = requiredEnv("TASK_EXECUTION_ROLE_ARN");
const taskRoleArn = requiredEnv("TASK_ROLE_ARN");
const runtimeContainerName = requiredEnv("RUNTIME_CONTAINER_NAME");
const subnetIds = requiredEnv("SUBNET_IDS").split(",");
const securityGroupIds = requiredEnv("SECURITY_GROUP_IDS").split(",");
const authSecretArn = requiredEnv("AUTH_SECRET_ARN");

// ECS caps the entire RunTask overrides JSON (env entries, role ARNs, and
// framing) at 8192 characters. Reserve headroom for the fixed entries.
const MAX_BOOTSTRAP_ENV_BYTES = 6_000;
const AUTH_SECRET_CACHE_MS = 5 * 60 * 1000;

let cachedAuthSecret: string | undefined;
let cachedAuthSecretAt = 0;

interface StartRequest {
  sessionId: string;
  sessionGroupId?: string | null;
  orgId: string;
  runtimeInstanceId: string;
  tool: string;
  model?: string | null;
  reasoningEffort?: string | null;
  bootstrapEnv: Record<string, string>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function response(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

function parseBody(body: string | undefined): Record<string, unknown> {
  if (!body) return {};
  const value = JSON.parse(body) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

class ValidationError extends Error {}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${key} is required`);
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function authenticate(authorization: string | undefined): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  if (!cachedAuthSecret || Date.now() - cachedAuthSecretAt > AUTH_SECRET_CACHE_MS) {
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: authSecretArn }));
    cachedAuthSecret = result.SecretString;
    cachedAuthSecretAt = Date.now();
  }
  return Boolean(cachedAuthSecret && safeEqual(authorization.slice(7), cachedAuthSecret));
}

function sanitizeTagValue(value: string): string {
  return value.replace(/[^\p{L}\p{Z}\p{N}_.:/=+\-@]/gu, "_").slice(0, 256);
}

function runtimeTags(input: StartRequest): Tag[] {
  return [
    { key: "Application", value: "trace" },
    { key: "TraceRuntimeId", value: sanitizeTagValue(input.runtimeInstanceId) },
    { key: "TraceSessionId", value: sanitizeTagValue(input.sessionId) },
    { key: "TraceOrganizationId", value: sanitizeTagValue(input.orgId) },
    ...(input.sessionGroupId
      ? [{ key: "TraceSessionGroupId", value: sanitizeTagValue(input.sessionGroupId) }]
      : []),
  ];
}

function runtimeEnvironment(input: StartRequest): KeyValuePair[] {
  const protectedNames = new Set([
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "CODING_TOOL",
    "TRACE_TOOL",
    "TRACE_MODEL",
    "TRACE_REASONING_EFFORT",
  ]);
  const entries = Object.entries(input.bootstrapEnv).filter(
    ([name, value]) =>
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
      !protectedNames.has(name) &&
      typeof value === "string",
  );
  if (entries.length > 80) throw new ValidationError("bootstrapEnv contains too many values");
  const totalBytes = entries.reduce(
    (sum, [name, value]) => sum + Buffer.byteLength(name) + Buffer.byteLength(value),
    0,
  );
  if (totalBytes > MAX_BOOTSTRAP_ENV_BYTES) throw new ValidationError("bootstrapEnv is too large");
  return [
    ...entries.map(([name, value]) => ({ name, value })),
    { name: "CODING_TOOL", value: input.tool },
    { name: "TRACE_TOOL", value: input.tool },
    ...(input.model ? [{ name: "TRACE_MODEL", value: input.model }] : []),
    ...(input.reasoningEffort
      ? [{ name: "TRACE_REASONING_EFFORT", value: input.reasoningEffort }]
      : []),
  ];
}

function runtimeLabel(runtimeInstanceId: string): string {
  return `trace-${runtimeInstanceId.slice(-12)}`;
}

async function start(body: Record<string, unknown>) {
  const bootstrapEnv = body.bootstrapEnv;
  if (!bootstrapEnv || typeof bootstrapEnv !== "object" || Array.isArray(bootstrapEnv)) {
    throw new ValidationError("bootstrapEnv is required");
  }
  const input: StartRequest = {
    sessionId: requiredString(body, "sessionId"),
    sessionGroupId:
      typeof body.sessionGroupId === "string"
        ? body.sessionGroupId
        : body.sessionGroupId === null
          ? null
          : undefined,
    orgId: requiredString(body, "orgId"),
    runtimeInstanceId: requiredString(body, "runtimeInstanceId"),
    tool: requiredString(body, "tool"),
    model: typeof body.model === "string" ? body.model : null,
    reasoningEffort: typeof body.reasoningEffort === "string" ? body.reasoningEffort : null,
    bootstrapEnv: Object.fromEntries(
      Object.entries(bootstrapEnv as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  };

  // ECS deduplicates RunTask by clientToken: a retry with identical parameters
  // returns the already-launched task, and a conflicting reuse surfaces the
  // existing task ARN through ConflictException. No launcher-side state needed.
  const clientToken = createHash("sha256").update(input.runtimeInstanceId).digest("hex");
  let taskArn: string | undefined;
  try {
    const result = await ecs.send(
      new RunTaskCommand({
        cluster: clusterArn,
        taskDefinition: taskDefinitionArn,
        launchType: "FARGATE",
        platformVersion: "LATEST",
        count: 1,
        clientToken,
        enableExecuteCommand: false,
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: "DISABLED",
            subnets: subnetIds,
            securityGroups: securityGroupIds,
          },
        },
        overrides: {
          executionRoleArn: taskExecutionRoleArn,
          taskRoleArn,
          containerOverrides: [
            { name: runtimeContainerName, environment: runtimeEnvironment(input) },
          ],
        },
        tags: runtimeTags(input),
      }),
    );
    const failure = result.failures?.[0];
    taskArn = result.tasks?.[0]?.taskArn;
    if (!taskArn)
      throw new Error(failure?.reason ?? failure?.detail ?? "ECS did not return a task");
  } catch (error) {
    if (!(error instanceof ConflictException) || !error.resourceIds?.[0]) throw error;
    taskArn = error.resourceIds[0];
  }
  return response(200, {
    runtimeId: taskArn,
    label: runtimeLabel(input.runtimeInstanceId),
    status: "provisioning",
  });
}

function isMissingTaskError(error: unknown): boolean {
  return error instanceof Error && /task was not found|not found/i.test(error.message);
}

async function stop(body: Record<string, unknown>) {
  const taskArn = requiredString(body, "runtimeId");
  try {
    await ecs.send(
      new StopTaskCommand({
        cluster: clusterArn,
        task: taskArn,
        reason:
          typeof body.reason === "string" ? body.reason.slice(0, 255) : "Trace session stopped",
      }),
    );
  } catch (error) {
    if (isMissingTaskError(error)) return response(200, { ok: true, status: "not_found" });
    throw error;
  }
  return response(200, { ok: true, status: "stopping" });
}

async function status(body: Record<string, unknown>) {
  const taskArn = requiredString(body, "runtimeId");
  const result = await ecs.send(
    new DescribeTasksCommand({ cluster: clusterArn, tasks: [taskArn] }),
  );
  // ECS forgets stopped tasks after about an hour; MISSING means stopped.
  if (result.failures?.length || !result.tasks?.[0]) {
    return response(200, { status: "stopped", message: "Runtime task no longer exists" });
  }
  const task = result.tasks[0];
  const lastStatus = task.lastStatus ?? "UNKNOWN";
  const mappedStatus =
    lastStatus === "RUNNING"
      ? "booting"
      : lastStatus === "STOPPED"
        ? task.stopCode === "EssentialContainerExited"
          ? "failed"
          : "stopped"
        : lastStatus === "DEPROVISIONING" || lastStatus === "STOPPING"
          ? "stopping"
          : "provisioning";
  return response(200, {
    status: mappedStatus,
    metadata: {
      lastStatus,
      desiredStatus: task.desiredStatus,
      stopCode: task.stopCode,
      stoppedReason: task.stoppedReason,
    },
  });
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const authorization = event.headers.authorization ?? event.headers.Authorization;
    if (!(await authenticate(authorization))) return response(401, { error: "Unauthorized" });
    const body = parseBody(event.body);
    switch (event.rawPath) {
      case "/start":
        return await start(body);
      case "/stop":
        return await stop(body);
      case "/status":
        return await status(body);
      default:
        return response(404, { error: "Not found" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown launcher error";
    console.error(
      JSON.stringify({ event: "runtime_launcher_error", path: event.rawPath, message }),
    );
    if (error instanceof ValidationError || error instanceof SyntaxError) {
      return response(400, { error: message });
    }
    return response(500, { error: "Launcher request failed" });
  }
};
