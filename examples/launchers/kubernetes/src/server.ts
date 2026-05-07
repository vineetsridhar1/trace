import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { isAuthorized } from "./auth.js";
import type { ControllerConfig } from "./config.js";
import { KubernetesApiError, KubernetesRuntimeClient } from "./kubernetes.js";
import type { RuntimeRecord, RuntimeStatusResponse, StartSessionRequest } from "./types.js";
import {
  RequestValidationError,
  validateSessionStatusRequest,
  validateStartSessionRequest,
  validateStopSessionRequest,
} from "./validation.js";

type RequestContext = {
  requestId: string;
  idempotencyKey: string | undefined;
};

export type RuntimeClient = {
  createRuntimeJob(
    request: StartSessionRequest,
    idempotencyKey: string | undefined,
  ): Promise<RuntimeRecord>;
  deleteRuntimeJob(runtimeId: string): Promise<{ alreadyGone: boolean }>;
  getRuntimeStatus(runtimeId: string): Promise<RuntimeStatusResponse>;
};

export function createServer(
  config: ControllerConfig,
  runtimeClient: RuntimeClient = new KubernetesRuntimeClient(config),
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

      const runtime = await runtimeClient.createRuntimeJob(body, context.idempotencyKey);

      log("start_session_created", {
        ...context,
        sessionId: body.sessionId,
        runtimeInstanceId: body.runtimeInstanceId,
        runtimeId: runtime.id,
      });

      res.json({
        runtimeId: runtime.id,
        runtimeUrl: `k8s://jobs/${runtime.namespace}/${runtime.id}`,
        label: runtime.label,
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

      const result = await runtimeClient.deleteRuntimeJob(body.runtimeId);

      log("stop_session_finished", {
        ...context,
        sessionId: body.sessionId,
        runtimeId: body.runtimeId,
        alreadyGone: result.alreadyGone,
      });

      res.json({ ok: true, status: result.alreadyGone ? "stopped" : "stopping" });
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
      const result = await runtimeClient.getRuntimeStatus(body.runtimeId);

      log("session_status_checked", {
        ...context,
        runtimeId: body.runtimeId,
        status: result.status,
      });

      res.json(result);
    } catch (error) {
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

  if (error instanceof KubernetesApiError) {
    log("kubernetes_api_error", { ...context, status: error.status, message: error.message });
    res.status(502).json({ error: "kubernetes_api_error", message: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  log("internal_error", { ...context, message });
  res.status(500).json({ error: "internal_error" });
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}
