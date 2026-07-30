import express, { Router, type Request, type Response, type Router as RouterType } from "express";
import { PLAN_FILE_MAX_BYTES } from "@trace/shared/plan-file";
import { verifyAgentRunToken } from "../lib/agent-run-auth.js";
import { sessionService } from "../services/session.js";

export const agentOutputRouter: RouterType = Router();

agentOutputRouter.use("/agent/outputs", express.json({ limit: PLAN_FILE_MAX_BYTES + 32 * 1024 }));

function bearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") return null;
  const [scheme, token, ...rest] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) return null;
  return token;
}

agentOutputRouter.post("/agent/outputs", async (req: Request, res: Response) => {
  const token = bearerToken(req);
  const auth = token ? verifyAgentRunToken(token) : null;
  if (!auth) return res.status(401).json({ error: "Invalid or expired Trace run token" });

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid Trace output submission" });
  }
  const body = req.body as Record<string, unknown>;
  if (
    body.type !== "visual-plan" ||
    (body.state !== "draft" && body.state !== "final") ||
    typeof body.runId !== "string" ||
    typeof body.sessionId !== "string" ||
    typeof body.filename !== "string" ||
    typeof body.sourcePath !== "string" ||
    typeof body.content !== "string"
  ) {
    return res.status(400).json({ error: "Invalid Trace output submission" });
  }
  if (body.runId !== auth.runId || body.sessionId !== auth.sessionId) {
    return res.status(403).json({ error: "Run token does not match this output submission" });
  }

  try {
    const result = await sessionService.submitVisualPlanOutput(
      auth.sessionId,
      auth.runId,
      auth.organizationId,
      {
        content: body.content,
        filename: body.filename,
        sourcePath: body.sourcePath,
        state: body.state,
      },
    );
    if (body.state === "final" && result.validationErrors.length > 0) {
      return res.status(422).json(result);
    }
    return res.status(result.ready ? 201 : 200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit Trace output";
    const status = message === "Trace plan run is not active yet" ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});
