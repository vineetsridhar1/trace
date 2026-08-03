import { Router, type Request, type Response, type Router as RouterType } from "express";
import { authenticateAccessToken, getRequestToken } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { readArtifactFile } from "../lib/artifact-bundle.js";
import { canViewSessionGroup } from "../services/access.js";

const router: RouterType = Router();

router.get("/artifacts/:artifactId/files/*path", async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  const auth = token ? await authenticateAccessToken(token) : null;
  if (!auth) return res.status(401).json({ error: "Not authenticated" });

  const artifactId = typeof req.params.artifactId === "string" ? req.params.artifactId : null;
  const requestedPath = Array.isArray(req.params.path)
    ? req.params.path.join("/")
    : req.params.path;
  if (!artifactId || typeof requestedPath !== "string") return res.status(404).end();

  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    include: {
      session: {
        select: {
          sessionGroup: { select: { visibility: true, ownerUserId: true } },
        },
      },
    },
  });
  if (!artifact) return res.status(404).end();

  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: auth.userId,
        organizationId: artifact.organizationId,
      },
    },
    select: { userId: true },
  });
  if (
    !membership ||
    (artifact.session.sessionGroup &&
      !canViewSessionGroup(artifact.session.sessionGroup, auth.userId))
  ) {
    return res.status(403).end();
  }

  const file = (
    artifact.manifest as {
      files?: Array<{ path?: string; mediaType?: string }>;
    }
  ).files?.find((candidate) => candidate.path === requestedPath);
  if (!file) return res.status(404).end();

  try {
    const archive = await storage.getObject(artifact.storageKey);
    const body = await readArtifactFile(archive, requestedPath);
    if (!body) return res.status(404).end();
    // Artifact HTML is agent-authored. The viewer reads it as text and renders it in a sandboxed
    // frame, so this route never needs to serve it as a live document — and must not, since
    // navigating here directly would execute it on the API origin with the caller's session.
    const isHtml = file.mediaType === "text/html";
    res.set({
      "Cache-Control": "private, max-age=3600",
      "Content-Type": isHtml
        ? "text/plain; charset=utf-8"
        : (file.mediaType ?? "application/octet-stream"),
      "X-Content-Type-Options": "nosniff",
      ...(isHtml ? { "Content-Security-Policy": "sandbox" } : {}),
    });
    return res.send(body);
  } catch {
    return res.status(404).end();
  }
});

export { router as artifactContentRouter };
