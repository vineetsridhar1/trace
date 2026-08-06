import { Router, type Request, type Response, type Router as RouterType } from "express";
import {
  hasAgentInvocationScope,
  verifyAgentInvocationToken,
} from "../lib/agent-invocation-auth.js";
import { ValidationError } from "../lib/errors.js";
import { sessionDesignService } from "../services/session-design.js";

const router: RouterType = Router();

function authenticate(req: Request) {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const auth = token ? verifyAgentInvocationToken(token) : null;
  return auth && hasAgentInvocationScope(auth, "design:read") ? auth : null;
}

router.get("/agent/designs", async (req: Request, res: Response) => {
  const auth = authenticate(req);
  if (!auth) return res.status(401).json({ error: "Invalid design credential" });

  try {
    const designs = await sessionDesignService.listForInvocation(auth);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ designs });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error("[agent-design] list failed", error);
    return res.status(500).json({ error: "Design listing failed" });
  }
});

router.get("/agent/designs/:designSessionGroupId/archive", async (req: Request, res: Response) => {
  const auth = authenticate(req);
  if (!auth) return res.status(401).json({ error: "Invalid design credential" });
  const designSessionGroupId = req.params.designSessionGroupId;
  if (typeof designSessionGroupId !== "string") {
    return res.status(400).json({ error: "Design id is required" });
  }

  try {
    const { design, archive } = await sessionDesignService.archiveForInvocation({
      ...auth,
      designSessionGroupId,
    });
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(archive.byteLength));
    res.setHeader("X-Trace-Design-Slug", design.slug);
    res.setHeader("X-Trace-Design-Commit", design.commitSha);
    return res.send(archive);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error("[agent-design] download failed", error);
    return res.status(500).json({ error: "Design download failed" });
  }
});

export { router as agentDesignRouter };
