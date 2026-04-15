import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { prisma } from "../lib/db.js";
import { getRequestToken, verifyToken } from "../lib/auth.js";
import { S3_BUCKET, s3, getPresignedGetUrl } from "../lib/s3.js";

const router: RouterType = Router();
const MAX_FILENAME_LENGTH = 100;
const FALLBACK_BASENAME = "image";

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

  const userId = verifyToken(token);
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

  const { filename, contentType } = req.body as {
    filename?: unknown;
    contentType?: unknown;
  };

  if (typeof filename !== "string" || !filename.trim()) {
    return res.status(400).json({ error: "filename is required" });
  }

  if (typeof contentType !== "string" || !contentType.trim()) {
    return res.status(400).json({ error: "contentType is required" });
  }

  if (!contentType.startsWith("image/")) {
    return res.status(400).json({ error: "contentType must be an image" });
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const key = `uploads/${randomUUID()}-${sanitizedFilename}`;
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return res.json({ uploadUrl, key });
});

router.get("/uploads/url", async (req: Request, res: Response) => {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = verifyToken(token);
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
  if (!key || !key.startsWith("uploads/") || key.includes("..")) {
    return res.status(400).json({ error: "Invalid key" });
  }

  const url = await getPresignedGetUrl(key);
  return res.json({ url });
});

export { router as uploadRouter };
