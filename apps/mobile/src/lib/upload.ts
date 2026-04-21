import { getAuthHeaders } from "@trace/client-core";
import { API_URL } from "./env";

const MAX_BYTES = 5 * 1024 * 1024;

interface UploadArgs {
  /** Raw base64 payload (no `data:` prefix). */
  base64: string;
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

function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Uploads a base64 image to S3 via the presign endpoint and returns the S3
 * key. Mirrors `apps/web/src/lib/upload.ts` but takes base64 + mime instead
 * of a `File`, since RN has no File object and `expo-clipboard` returns
 * base64.
 */
export async function uploadImage({
  base64,
  mimeType,
  organizationId,
}: UploadArgs): Promise<string> {
  if (!mimeType.startsWith("image/")) {
    throw new Error("File must be an image");
  }
  if (base64ByteLength(base64) > MAX_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }

  const filename = `clipboard-${Date.now()}.${extensionFor(mimeType)}`;

  const presignResponse = await fetch(`${API_URL}/uploads/presign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ filename, contentType: mimeType, organizationId }),
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

  // Convert base64 → Blob using a data URL round-trip. React Native's fetch
  // supports `data:` URLs and returns a real Blob we can PUT directly to S3.
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const blob = await (await fetch(dataUrl)).blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error("Failed to upload image");
  }

  return key;
}
