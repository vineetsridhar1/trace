import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { isAuthorized } from "./auth.js";
import type { ControllerConfig } from "./config.js";
import { FlyApiError, FlyMachinesClient } from "./fly.js";
import { mapFlyStateToTraceStatus } from "./status.js";
import {
  validateSessionStatusRequest,
  validateStartSessionRequest,
  validateStopSessionRequest,
  RequestValidationError,
} from "./validation.js";

type RequestContext = {
  requestId: string;
  idempotencyKey: string | undefined;
};

export function createServer(
  config: ControllerConfig,
  flyClient = new FlyMachinesClient(config),
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "128kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/trace/start-session", async (req, res) => {
    const context = requestContext(req);
    if (!authorize(req, res, config, context)) {
      return;
    }

    try {
      const body = validateStartSessionRequest(req.body);
      log("start_session_requested", {
        ...context,
        sessionId: body.sessionId,
        runtimeInstanceId: body.runtimeInstanceId,
      });

      const machine = await flyClient.createRuntimeMachine(body, context.idempotencyKey);

      log("start_session_created", {
        ...context,
        sessionId: body.sessionId,
        runtimeInstanceId: body.runtimeInstanceId,
        flyMachineId: machine.id,
      });

      res.json({
        runtimeId: machine.id,
        runtimeUrl: `https://fly.io/apps/${config.flyAppName}/machines/${machine.id}`,
        label: `Fly ${machine.region ?? config.flyRegion}`,
        status: "provisioning",
      });
    } catch (error) {
      handleError(error, res, context);
    }
  });

  app.post("/trace/stop-session", async (req, res) => {
    const context = requestContext(req);
    if (!authorize(req, res, config, context)) {
      return;
    }

    try {
      const body = validateStopSessionRequest(req.body);
      log("stop_session_requested", {
        ...context,
        sessionId: body.sessionId,
        runtimeId: body.runtimeId,
        reason: body.reason,
      });

      await flyClient.stopMachine(body.runtimeId);
      if (config.deleteAfterStop) {
        await flyClient.deleteMachine(body.runtimeId);
      }

      log("stop_session_finished", {
        ...context,
        sessionId: body.sessionId,
        runtimeId: body.runtimeId,
        deleted: config.deleteAfterStop,
      });

      res.json({ ok: true, status: "stopped" });
    } catch (error) {
      handleError(error, res, context);
    }
  });

  app.post("/trace/session-status", async (req, res) => {
    const context = requestContext(req);
    if (!authorize(req, res, config, context)) {
      return;
    }

    try {
      const body = validateSessionStatusRequest(req.body);
      const machine = await flyClient.getMachine(body.runtimeId);
      const status = mapFlyStateToTraceStatus(machine.state);

      log("session_status_checked", {
        ...context,
        runtimeId: body.runtimeId,
        flyMachineId: machine.id,
        flyState: machine.state,
        status,
      });

      res.json({
        status,
        metadata: {
          flyState: machine.state ?? "unknown",
          machineId: machine.id,
        },
      });
    } catch (error) {
      if (error instanceof FlyApiError && error.status === 404) {
        res.json({
          status: "stopped",
          message: "Fly Machine was not found; it may already be deleted.",
          metadata: {
            flyState: "not_found",
            machineId: validateRuntimeIdFromUnknown(req.body),
          },
        });
        return;
      }

      handleError(error, res, context);
    }
  });

  return app;
}

function authorize(
  req: Request,
  res: Response,
  config: ControllerConfig,
  context: RequestContext,
): boolean {
  if (isAuthorized(req.header("authorization"), config.traceLauncherBearerToken)) {
    return true;
  }

  log("unauthorized_request", {
    ...context,
    path: req.path,
  });
  res.status(401).json({ error: "unauthorized" });
  return false;
}

function requestContext(req: Request): RequestContext {
  return {
    requestId: req.header("x-request-id") ?? randomUUID(),
    idempotencyKey: req.header("trace-idempotency-key") ?? undefined,
  };
}

function handleError(error: unknown, res: Response, context: RequestContext): void {
  if (error instanceof RequestValidationError) {
    log("validation_error", { ...context, message: error.message });
    res.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof FlyApiError) {
    log("fly_api_error", { ...context, status: error.status, message: error.message });
    res.status(502).json({ error: "fly_api_error", message: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  log("internal_error", { ...context, message });
  res.status(500).json({ error: "internal_error" });
}

function validateRuntimeIdFromUnknown(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "runtimeId" in body &&
    typeof body.runtimeId === "string"
  ) {
    return body.runtimeId;
  }

  return "unknown";
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      level: "info",
      event,
      ...fields,
    }),
  );
}
