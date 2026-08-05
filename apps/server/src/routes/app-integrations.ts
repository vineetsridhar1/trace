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
  "/runtime/app-integrations/:bindingId/snowflake/query",
  async (request: Request, response: Response) => {
    try {
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
      if (!bindingId) throw new ValidationError("Integration binding is required");
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
        .json({
          error: error instanceof Error ? error.message : "Snowflake query failed",
        });
    }
  },
);
