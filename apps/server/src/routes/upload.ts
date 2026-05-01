import { randomUUID } from "crypto";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { prisma } from "../lib/db.js";
import {
  authenticateAccessToken,
  getRequestToken,
  isExternalLocalModeRequest,
} from "../lib/auth.js";
import { isLocalMode } from "../lib/mode.js";
import { getCanonicalLocalOrganizationId } from "../services/local-bootstrap.js";
import { storage } from "../lib/storage/index.js";

const router: RouterType = Router();
const MAX_FILENAME_LENGTH = 100;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const FALLBACK_BASENAME = "file";
const EXTERNAL_LOCAL_MODE_AUTH_ERROR = "External local-mode access requires a paired mobile token";
const ALLOWED_EXACT_CONTENT_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/zip",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

function isAllowedContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("text/") ||
    ALLOWED_EXACT_CONTENT_TYPES.has(normalized)
  );
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

  const auth = await authenticateAccessToken(token);
  if (!auth) {
    return res.status(401).json({ error: "Invalid token" });
  }
  if (isExternalLocalModeRequest(req) && auth.kind !== "local_mobile") {
    return res.status(403).json({ error: EXTERNAL_LOCAL_MODE_AUTH_ERROR });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true },
  });
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  const { filename, contentType, contentLength, organizationId } = req.body as {
    filename?: unknown;
    contentType?: unknown;
    contentLength?: unknown;
    organizationId?: unknown;
  };

  if (typeof organizationId !== "string" || !organizationId.trim()) {
    return res.status(400).json({ error: "organizationId is required" });
  }

  const effectiveOrganizationId = isLocalMode()
    ? await getCanonicalLocalOrganizationId()
    : organizationId;
  if (!effectiveOrganizationId) {
    return res.status(403).json({ error: "No active organization found" });
  }

  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_organizationId: {
        userId: auth.userId,
        organizationId: effectiveOrganizationId,
      },
    },
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

  const normalizedContentType = contentType.trim().toLowerCase();
  if (!isAllowedContentType(normalizedContentType)) {
    return res.status(400).json({ error: "contentType is not supported" });
  }

  if (typeof contentLength !== "number" || !Number.isInteger(contentLength) || contentLength <= 0) {
    return res.status(400).json({ error: "contentLength is required" });
  }

  if (contentLength > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: "File must be 5MB or smaller" });
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const key = `uploads/${effectiveOrganizationId}/${randomUUID()}-${sanitizedFilename}`;
  const uploadTarget = await storage.getUploadTarget(key, normalizedContentType, MAX_UPLOAD_BYTES);

  return res.json({ uploadUrl: uploadTarget.url, uploadTarget, key });
});

router.get("/uploads/url", async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const auth = await authenticateAccessToken(token);
  if (!auth) {
    return res.status(401).json({ error: "Invalid token" });
  }
  if (isExternalLocalModeRequest(req) && auth.kind !== "local_mobile") {
    return res.status(403).json({ error: EXTERNAL_LOCAL_MODE_AUTH_ERROR });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true },
  });
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  const key = req.query.key as string | undefined;
  if (!key || !key.startsWith("uploads/") || key.includes("..")) {
    return res.status(400).json({ error: "Invalid key" });
  }

  // Keys use format uploads/{orgId}/{uuid}-{filename} — validate org membership
  const segments = key.split("/");
  if (segments.length >= 3 && segments[1]) {
    const orgId = segments[1];
    const canonicalOrgId = isLocalMode() ? await getCanonicalLocalOrganizationId() : null;
    if (canonicalOrgId && orgId !== canonicalOrgId) {
      return res.status(403).json({ error: "Local mode only supports one organization" });
    }
    const membership = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId: auth.userId, organizationId: orgId } },
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
