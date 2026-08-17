import { Router, type Request, type Response, type Router as RouterType } from "express";
import { AuthorizationError } from "../lib/errors.js";
import { appDeploymentService } from "../services/app-deployment.js";

const router: RouterType = Router();

router.get(
  "/internal/app-deployments/:deploymentId/source",
  async (req: Request, res: Response) => {
    const authorization = req.header("authorization") ?? "";
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    const deploymentId = req.params.deploymentId;
    if (!match?.[1] || typeof deploymentId !== "string") {
      res.status(401).json({ error: "Missing deployment source credentials" });
      return;
    }
    try {
      const source = await appDeploymentService.openSourceArchive(deploymentId, match[1]);
      res.set({
        "content-type": "application/gzip",
        "cache-control": "no-store",
        "x-trace-deployment-commit": source.commitSha,
      });
      source.stream.on("error", () => {
        if (!res.headersSent) res.status(500);
        res.end();
      });
      source.stream.pipe(res);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        res.status(401).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

export { router as appDeploymentSourceRouter };
