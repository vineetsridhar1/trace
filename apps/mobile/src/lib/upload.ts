import { getAuthHeaders } from "@trace/client-core";
import { getActiveApiUrl } from "./connection-target";
import { UploadedImageUrlCache } from "./upload-url-cache";

const MAX_BYTES = 5 * 1024 * 1024;
const uploadedImageUrlCache = new UploadedImageUrlCache();

interface UploadArgs {
  /** Raw base64 payload (no `data:` prefix). One of `base64`/`fileUri` is required. */
  base64?: string;
  /** Local `file://` or `content://` URI — the gallery picker path uses this. */
  fileUri?: string;
  /** e.g. `image/png` — also used as the S3 PUT `Content-Type`. */
  mimeType: string;
  organizationId: string;
}

function extensionFor(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower === "image/jpeg" || lower === "image/jpg") return "jpg";
  if (lower === "image/png") return "png";
  if (lower === "image/gif") return "gif";
  if (lower === "image/webp") return "webp";
  if (lower === "image/heic") return "heic";
  return "img";
}

async function bodyFromArgs(args: UploadArgs): Promise<Blob> {
  if (args.fileUri) {
    // RN's fetch handles both `file://` (iOS cached asset from the picker)
    // and `content://` (Android) URIs and returns a real Blob we can PUT.
    const res = await fetch(args.fileUri);
    if (!res.ok) throw new Error("Could not read picked image");
    return await res.blob();
  }
  if (args.base64) {
    const dataUrl = `data:${args.mimeType};base64,${args.base64}`;
    return await (await fetch(dataUrl)).blob();
  }
  throw new Error("uploadImage requires base64 or fileUri");
}

/**
 * Uploads an image to S3 via the presign endpoint and returns the S3 key.
 * Accepts either raw base64 (clipboard path) or a local URI (gallery picker
 * path). Reads bytes lazily so a URI-only attachment doesn't need base64
 * buffered in JS memory until send time.
 */
export async function uploadImage(args: UploadArgs): Promise<string> {
  if (!args.mimeType.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  const blob = await bodyFromArgs(args);
  if (blob.size > MAX_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }

  const filename = `attachment-${Date.now()}.${extensionFor(args.mimeType)}`;
  const apiUrl = getActiveApiUrl();
  if (!apiUrl) {
    throw new Error("No active Trace host is configured");
  }

  const presignResponse = await fetch(`${apiUrl}/uploads/presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      filename,
      contentType: args.mimeType,
      organizationId: args.organizationId,
    }),
  });

  if (!presignResponse.ok) {
    throw new Error("Failed to create upload URL");
  }

  const { uploadUrl, key } = (await presignResponse.json()) as {
    uploadUrl?: string;
    key?: string;
  };
  if (!uploadUrl || !key) {
    throw new Error("Invalid upload response");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": args.mimeType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error("Failed to upload image");
  }

  return key;
}

export function getCachedUploadedImageUrl(key: string): string | null {
  return uploadedImageUrlCache.get(key);
}

export async function getUploadedImageUrl(key: string): Promise<string> {
  const cached = getCachedUploadedImageUrl(key);
  if (cached) return cached;

  const apiUrl = getActiveApiUrl();
  if (!apiUrl) {
    throw new Error("No active Trace host is configured");
  }

  const response = await fetch(`${apiUrl}/uploads/url?key=${encodeURIComponent(key)}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to load image URL");
  }

  const { url } = (await response.json()) as { url?: string };
  if (!url) {
    throw new Error("Invalid image URL response");
  }

  uploadedImageUrlCache.set(key, url);
  return url;
}
