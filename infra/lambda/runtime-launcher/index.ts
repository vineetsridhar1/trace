import { createHash, timingSafeEqual } from "node:crypto";
import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
  type KeyValuePair,
  type Tag,
} from "@aws-sdk/client-ecs";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

const ecs = new ECSClient({});
const dynamodb = new DynamoDBClient({});
const secrets = new SecretsManagerClient({});

const clusterArn = requiredEnv("CLUSTER_ARN");
const taskDefinitionArn = requiredEnv("TASK_DEFINITION_ARN");
const taskExecutionRoleArn = requiredEnv("TASK_EXECUTION_ROLE_ARN");
const taskRoleArn = requiredEnv("TASK_ROLE_ARN");
const runtimeContainerName = requiredEnv("RUNTIME_CONTAINER_NAME");
const subnetIds = requiredEnv("SUBNET_IDS").split(",");
const securityGroupIds = requiredEnv("SECURITY_GROUP_IDS").split(",");
const tableName = requiredEnv("RUNTIME_TABLE_NAME");
const authSecretArn = requiredEnv("AUTH_SECRET_ARN");

let cachedAuthSecret: string | undefined;

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

interface RuntimeRecord {
  runtimeId: string;
  taskArn?: string;
  status: string;
  sessionId?: string;
  orgId?: string;
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
    throw new Error("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function authenticate(authorization: string | undefined): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  if (!cachedAuthSecret) {
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: authSecretArn }));
    cachedAuthSecret = result.SecretString;
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
  if (entries.length > 80) throw new Error("bootstrapEnv contains too many values");
  const totalBytes = entries.reduce(
    (sum, [name, value]) => sum + Buffer.byteLength(name) + Buffer.byteLength(value),
    0,
  );
  if (totalBytes > 24_000) throw new Error("bootstrapEnv is too large");
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

async function getRuntime(runtimeId: string): Promise<RuntimeRecord | null> {
  const result = await dynamodb.send(
    new GetItemCommand({ TableName: tableName, Key: { runtimeId: { S: runtimeId } } }),
  );
  if (!result.Item) return null;
  return {
    runtimeId,
    taskArn: result.Item.taskArn?.S,
    status: result.Item.status?.S ?? "unknown",
    sessionId: result.Item.sessionId?.S,
    orgId: result.Item.orgId?.S,
  };
}

async function reserveRuntime(input: StartRequest): Promise<boolean> {
  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        ConditionExpression: "attribute_not_exists(runtimeId)",
        Item: {
          runtimeId: { S: input.runtimeInstanceId },
          sessionId: { S: input.sessionId },
          orgId: { S: input.orgId },
          status: { S: "provisioning" },
          createdAt: { S: new Date().toISOString() },
          expiresAt: { N: String(Math.floor(Date.now() / 1000) + 31 * 24 * 60 * 60) },
        },
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
}

async function updateRuntime(runtimeId: string, status: string, taskArn?: string): Promise<void> {
  await dynamodb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { runtimeId: { S: runtimeId } },
      UpdateExpression: taskArn
        ? "SET #status = :status, taskArn = :taskArn, updatedAt = :updatedAt"
        : "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": { S: status },
        ":updatedAt": { S: new Date().toISOString() },
        ...(taskArn ? { ":taskArn": { S: taskArn } } : {}),
      },
    }),
  );
}

async function start(body: Record<string, unknown>) {
  const bootstrapEnv = body.bootstrapEnv;
  if (!bootstrapEnv || typeof bootstrapEnv !== "object" || Array.isArray(bootstrapEnv)) {
    throw new Error("bootstrapEnv is required");
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

  const reserved = await reserveRuntime(input);
  if (!reserved) {
    const existing = await getRuntime(input.runtimeInstanceId);
    return response(200, {
      runtimeId: input.runtimeInstanceId,
      label: `trace-${input.runtimeInstanceId.slice(-12)}`,
      status: existing?.status ?? "provisioning",
    });
  }

  try {
    const clientToken = createHash("sha256").update(input.runtimeInstanceId).digest("hex");
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
    const taskArn = result.tasks?.[0]?.taskArn;
    if (!taskArn)
      throw new Error(failure?.reason ?? failure?.detail ?? "ECS did not return a task");
    await updateRuntime(input.runtimeInstanceId, "provisioning", taskArn);
    return response(200, {
      runtimeId: input.runtimeInstanceId,
      label: `trace-${input.runtimeInstanceId.slice(-12)}`,
      status: "provisioning",
    });
  } catch (error) {
    await updateRuntime(input.runtimeInstanceId, "failed");
    throw error;
  }
}

async function stop(body: Record<string, unknown>) {
  const runtimeId = requiredString(body, "runtimeId");
  const runtime = await getRuntime(runtimeId);
  if (!runtime) return response(200, { ok: true, status: "not_found" });
  if (!runtime.taskArn) {
    await updateRuntime(runtimeId, "stopped");
    return response(200, { ok: true, status: "stopped" });
  }
  await ecs.send(
    new StopTaskCommand({
      cluster: clusterArn,
      task: runtime.taskArn,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 255) : "Trace session stopped",
    }),
  );
  await updateRuntime(runtimeId, "stopping");
  return response(200, { ok: true, status: "stopping" });
}

async function status(body: Record<string, unknown>) {
  const runtimeId = requiredString(body, "runtimeId");
  const runtime = await getRuntime(runtimeId);
  if (!runtime) return response(200, { status: "stopped", message: "Runtime not found" });
  if (!runtime.taskArn) return response(200, { status: runtime.status });
  const result = await ecs.send(
    new DescribeTasksCommand({ cluster: clusterArn, tasks: [runtime.taskArn] }),
  );
  if (result.failures?.length || !result.tasks?.[0]) {
    await updateRuntime(runtimeId, "stopped");
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
  await updateRuntime(runtimeId, mappedStatus);
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
    const statusCode = /required|must|too many|too large/.test(message) ? 400 : 500;
    return response(statusCode, { error: message });
  }
};
