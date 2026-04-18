import { randomUUID } from "crypto";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { prisma } from "../lib/db.js";
import { getRequestToken, verifyToken } from "../lib/auth.js";
import { storage } from "../lib/storage/index.js";

const router: RouterType = Router();
const MAX_FILENAME_LENGTH = 100;
const FALLBACK_BASENAME = "image";

// SVG is an active image format and can execute script inline; keep the list
// restricted to inert raster formats only.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const UPLOAD_KEY_PATTERN = /^uploads\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;

function isValidUploadKey(key: string): boolean {
  if (!UPLOAD_KEY_PATTERN.test(key)) return false;
  if (key.includes("..") || key.includes("\\")) return false;
  return true;
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const extIndex = trimmed.lastIndexOf(".");
  const rawBase = extIndex > 0 ? trimmed.slice(0, extIndex) : trimmed;
  const rawExt = extIndex > 0 ? trimmed.slice(extIndex + 1) : "";

  const base = rawBase.replace(/[^a-zA-Z0-9._-]/g, "") || FALLBACK_BASENAME;
  const extension = rawExt.replace(/[^a-zA-Z0-9_-]/g, "");
  const suffix = extension ? `.${extension}` : "";
  const maxBaseLength = Math.max(1, MAX_FILENAME_LENGTH - suffix.length);
  const truncatedBase = base.slice(0, maxBaseLength);

  return `${truncatedBase}${suffix}`.slice(0, MAX_FILENAME_LENGTH);
}

router.post("/uploads/presign", async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  const { filename, contentType, organizationId } = req.body as {
    filename?: unknown;
    contentType?: unknown;
    organizationId?: unknown;
  };

  if (typeof organizationId !== "string" || !organizationId.trim()) {
    return res.status(400).json({ error: "organizationId is required" });
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  });
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this organization" });
  }

  if (typeof filename !== "string" || !filename.trim()) {
    return res.status(400).json({ error: "filename is required" });
  }

  if (typeof contentType !== "string" || !contentType.trim()) {
    return res.status(400).json({ error: "contentType is required" });
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    return res
      .status(400)
      .json({ error: "Unsupported image type (allowed: jpeg, png, webp, gif)" });
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const key = `uploads/${organizationId}/${randomUUID()}-${sanitizedFilename}`;
  const uploadUrl = await storage.getPutUrl(key, contentType);

  return res.json({ uploadUrl, key });
});

router.get("/uploads/url", async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = await verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  const key = req.query.key as string | undefined;
  if (!key || !isValidUploadKey(key)) {
    return res.status(400).json({ error: "Invalid key" });
  }

  // Keys use format uploads/{orgId}/{uuid}-{filename} — validate org membership
  const segments = key.split("/");
  if (segments.length >= 3 && segments[1]) {
    const orgId = segments[1];
    const membership = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      select: { role: true },
    });
    if (!membership) {
      return res.status(403).json({ error: "Not authorized to access this file" });
    }
  }

  const url = await storage.getGetUrl(key);
  return res.json({ url });
});

export { router as uploadRouter };
