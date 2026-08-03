import express, { Router, type Request, type Response, type Router as RouterType } from "express";
import { verifyAgentInvocationToken } from "../lib/agent-invocation-auth.js";
import { artifactService } from "../services/artifact.js";
import { ValidationError } from "../lib/errors.js";

const router: RouterType = Router();
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

router.post(
  "/agent/artifacts",
  express.raw({ type: "application/gzip", limit: MAX_ARCHIVE_BYTES }),
  async (req: Request, res: Response) => {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const auth = token ? verifyAgentInvocationToken(token) : null;
    if (!auth) return res.status(401).json({ error: "Invalid artifact credential" });

    const type = req.header("x-trace-artifact-type");
    const key = req.header("x-trace-artifact-key") ?? "default";
    const idempotencyKey = req.header("x-trace-idempotency-key");
    if (!type || !idempotencyKey || !Buffer.isBuffer(req.body)) {
      return res
        .status(400)
        .json({ error: "Artifact type, idempotency key, and gzip body are required" });
    }

    try {
      const artifact = await artifactService.create({
        organizationId: auth.organizationId,
        sessionId: auth.sessionId,
        invocationId: auth.invocationId,
        type,
        key,
        idempotencyKey,
        archive: req.body,
      });
      return res.status(201).json({ artifact });
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
      console.error("[agent-artifact] upload failed", error);
      return res.status(500).json({ error: "Artifact upload failed" });
    }
  },
);

export { router as agentArtifactRouter };
