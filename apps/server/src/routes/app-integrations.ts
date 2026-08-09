import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/db.js";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import { appIntegrationService, type SnowflakeQueryInput } from "../services/app-integrations.js";
import { verifyAppViewerContextToken } from "../services/app-viewer-context.js";

export const appIntegrationsRouter = Router();

function bearerToken(request: Request): string | null {
  const authorization = request.get("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

async function runtimeRequestContext(request: Request) {
  const token = bearerToken(request);
  const context = token ? verifyAppViewerContextToken(token) : null;
  if (!context) throw new AuthenticationError("Invalid app viewer context");
  const endpoint = await prisma.sessionEndpoint.findFirst({
    where: {
      id: context.endpointId,
      organizationId: context.organizationId,
      sessionGroupId: context.sessionGroupId,
      status: "enabled",
    },
    select: { organizationId: true, sessionGroupId: true },
  });
  if (!endpoint) throw new AuthorizationError("Application endpoint is unavailable");
  const bindingId = Array.isArray(request.params.bindingId)
    ? request.params.bindingId[0]
    : request.params.bindingId;
  if (!bindingId) throw new ValidationError("Integration is required");
  return { bindingId, context, endpoint };
}

function sendIntegrationError(response: Response, error: unknown, fallback: string) {
  const status =
    error instanceof AuthenticationError
      ? 401
      : error instanceof AuthorizationError
        ? 403
        : error instanceof NotFoundError
          ? 404
          : error instanceof ValidationError
            ? 400
            : 502;
  response
    .status(status)
    .set("Cache-Control", "no-store")
    .json({ error: error instanceof Error ? error.message : fallback });
}

function integrationRequestInput(value: unknown) {
  if (!value || typeof value !== "object") throw new ValidationError("Invalid integration request");
  const body = value as Record<string, unknown>;
  if (typeof body.method !== "string") throw new ValidationError("HTTP method is required");
  if (typeof body.path !== "string") throw new ValidationError("Provider path is required");
  const query = body.query;
  const search = new URLSearchParams();
  if (query !== undefined) {
    if (!query || typeof query !== "object" || Array.isArray(query)) {
      throw new ValidationError("Integration query parameters must be an object");
    }
    for (const [key, item] of Object.entries(query as Record<string, unknown>)) {
      if (!["string", "number", "boolean"].includes(typeof item)) {
        throw new ValidationError("Integration query parameters must be scalar values");
      }
      search.set(key, String(item));
    }
  }
  return {
    method: body.method,
    path: body.path,
    query: search.size > 0 ? search.toString() : null,
    contentType: body.body === undefined ? null : "application/json",
    body: body.body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body.body)),
  };
}

function snowflakeQueryInput(value: unknown): SnowflakeQueryInput {
  if (!value || typeof value !== "object") throw new ValidationError("Invalid Snowflake query");
  const body = value as Record<string, unknown>;
  if (typeof body.sql !== "string") throw new ValidationError("Snowflake query is required");
  const parameters = body.parameters;
  if (
    parameters !== undefined &&
    (!Array.isArray(parameters) ||
      !parameters.every(
        (parameter) =>
          typeof parameter === "string" ||
          typeof parameter === "number" ||
          typeof parameter === "boolean",
      ))
  ) {
    throw new ValidationError("Snowflake parameters must be strings, numbers, or booleans");
  }
  for (const field of ["database", "schema", "warehouse"] as const) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      throw new ValidationError(`Snowflake ${field} must be a string`);
    }
  }
  if (body.timeoutSeconds !== undefined && typeof body.timeoutSeconds !== "number") {
    throw new ValidationError("Snowflake timeout must be a number");
  }
  return {
    sql: body.sql,
    ...(parameters === undefined
      ? {}
      : { parameters: parameters as Array<string | number | boolean> }),
    ...(body.database === undefined ? {} : { database: body.database as string }),
    ...(body.schema === undefined ? {} : { schema: body.schema as string }),
    ...(body.warehouse === undefined ? {} : { warehouse: body.warehouse as string }),
    ...(body.timeoutSeconds === undefined ? {} : { timeoutSeconds: body.timeoutSeconds as number }),
  };
}

appIntegrationsRouter.post(
  "/runtime/app-integrations/:bindingId/request",
  async (request: Request, response: Response) => {
    try {
      const { bindingId, context, endpoint } = await runtimeRequestContext(request);
      const result = await appIntegrationService.execute({
        endpoint,
        userId: context.userId,
        bindingId,
        ...integrationRequestInput(request.body as unknown),
      });
      response.status(result.status);
      response.set("Cache-Control", "no-store");
      response.set("X-Content-Type-Options", "nosniff");
      if (result.contentType) response.set("Content-Type", result.contentType);
      response.send(result.body);
    } catch (error: unknown) {
      sendIntegrationError(response, error, "Integration request failed");
    }
  },
);

appIntegrationsRouter.post(
  "/runtime/app-integrations/:bindingId/snowflake/query",
  async (request: Request, response: Response) => {
    try {
      const { bindingId, context, endpoint } = await runtimeRequestContext(request);
      const result = await appIntegrationService.executeSnowflakeQuery({
        endpoint,
        userId: context.userId,
        bindingId,
        query: snowflakeQueryInput(request.body as unknown),
      });
      response.status(result.status);
      response.set("Cache-Control", "no-store");
      response.set("X-Content-Type-Options", "nosniff");
      if (result.contentType) response.set("Content-Type", result.contentType);
      response.send(result.body);
    } catch (error: unknown) {
      sendIntegrationError(response, error, "Snowflake query failed");
    }
  },
);
