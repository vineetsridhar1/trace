import { Router, type Request, type Response, type Router as RouterType } from "express";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import { appDeploymentService, type AppDeploymentCallback } from "../services/app-deployment.js";

const router: RouterType = Router();
const CALLBACK_STATUSES = new Set(["building", "deploying", "live", "failed"]);

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseCallback(body: unknown): AppDeploymentCallback {
  if (!body || typeof body !== "object") throw new ValidationError("Invalid callback body");
  const input = body as Record<string, unknown>;
  if (typeof input.status !== "string" || !CALLBACK_STATUSES.has(input.status)) {
    throw new ValidationError("Invalid deployment status");
  }
  return {
    status: input.status as AppDeploymentCallback["status"],
    externalJobId: optionalString(input.externalJobId),
    imageDigest: optionalString(input.imageDigest),
    url: optionalString(input.url),
    errorMessage: optionalString(input.errorMessage),
  };
}

router.post(
  "/internal/app-deployments/:deploymentId/status",
  async (req: Request, res: Response) => {
    const authorization = req.header("authorization") ?? "";
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match?.[1]) {
      res.status(401).json({ error: "Missing deployment callback credentials" });
      return;
    }
    const deploymentId = req.params.deploymentId;
    if (typeof deploymentId !== "string") {
      res.status(400).json({ error: "Invalid deployment id" });
      return;
    }
    try {
      const deployment = await appDeploymentService.updateFromCallback(
        deploymentId,
        match[1],
        parseCallback(req.body),
      );
      res.json({ id: deployment.id, status: deployment.status });
    } catch (error) {
      if (error instanceof AuthorizationError) {
        res.status(401).json({ error: error.message });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

export { router as appDeploymentCallbackRouter };
