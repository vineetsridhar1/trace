import { Router, type Request, type Response, type Router as RouterType } from "express";
import { authenticateAccessToken, getRequestToken } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { canViewSessionGroup } from "../services/access.js";

const router: RouterType = Router();
const ANIMATION_PREVIEW_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline' data: blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data: blob:",
  "frame-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function animationPreviewCsp(): string {
  let frameAncestors = "'self'";
  try {
    const webOrigin = process.env.TRACE_WEB_URL ? new URL(process.env.TRACE_WEB_URL).origin : null;
    if (webOrigin) frameAncestors += ` ${webOrigin}`;
  } catch {
    // Invalid optional configuration must not weaken the preview sandbox.
  }
  return `${ANIMATION_PREVIEW_CSP}; frame-ancestors ${frameAncestors}`;
}

router.get("/animation-previews/groups/:sessionGroupId", async (req: Request, res: Response) => {
  const sessionGroupId =
    typeof req.params.sessionGroupId === "string" ? req.params.sessionGroupId : null;
  if (!sessionGroupId) return res.status(404).end();
  const token = getRequestToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  const auth = await authenticateAccessToken(token);
  if (!auth) return res.status(401).json({ error: "Invalid token" });

  const sessionGroup = await prisma.sessionGroup.findUnique({
    where: { id: sessionGroupId },
    select: { organizationId: true, visibility: true, ownerUserId: true, animationPreviewKey: true },
  });
  if (!sessionGroup?.animationPreviewKey) return res.status(404).end();
  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: auth.userId,
        organizationId: sessionGroup.organizationId,
      },
    },
    select: { userId: true },
  });
  if (!membership || !canViewSessionGroup(sessionGroup, auth.userId)) return res.status(403).end();

  try {
    const html = await storage.getObject(sessionGroup.animationPreviewKey);
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": animationPreviewCsp(),
      "Cross-Origin-Opener-Policy": "same-origin",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    return res.type("html").send(html);
  } catch (error) {
    console.warn("[animation-preview] saved preview read failed", {
      sessionGroupId,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(404).end();
  }
});

export { router as animationPreviewRouter };
