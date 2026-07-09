import { Router, type Request, type Response } from "express";
import { managedGitService } from "../services/managed-git.js";

const router = Router();

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

router.get("/:orgId/:repoId.git/info/refs", (req: Request, res: Response) => {
  void managedGitService
    .handleInfoRefs(req, res, {
      orgId: routeParam(req.params.orgId),
      repoId: routeParam(req.params.repoId),
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) res.status(500);
      res.end(message);
    });
});

router.post("/:orgId/:repoId.git/git-upload-pack", (req: Request, res: Response) => {
  void managedGitService
    .handleRpc(req, res, {
      orgId: routeParam(req.params.orgId),
      repoId: routeParam(req.params.repoId),
      service: "git-upload-pack",
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) res.status(500);
      res.end(message);
    });
});

router.post("/:orgId/:repoId.git/git-receive-pack", (req: Request, res: Response) => {
  void managedGitService
    .handleRpc(req, res, {
      orgId: routeParam(req.params.orgId),
      repoId: routeParam(req.params.repoId),
      service: "git-receive-pack",
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) res.status(500);
      res.end(message);
    });
});

export { router as managedGitRouter };
