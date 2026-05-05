import { getAuthHeaders } from "@trace/client-core";
import { File, Paths } from "expo-file-system";
import { isPreviewableImageMimeType } from "./attachment-utils";
import { getActiveApiUrl } from "./connection-target";
import { UploadedImageUrlCache } from "./upload-url-cache";

const MAX_BYTES = 5 * 1024 * 1024;
const uploadedImageUrlCache = new UploadedImageUrlCache();

interface UploadArgs {
  /** Raw base64 payload (no `data:` prefix). One of `base64`/`fileUri` is required. */
  base64?: string;
  /** Local `file://` or `content://` URI — the gallery picker path uses this. */
  fileUri?: string;
  filename: string;
  /** e.g. `image/png` — also used as the S3 PUT `Content-Type`. */
  mimeType: string;
  /** File size in bytes when the picker reported it. */
  size?: number;
  organizationId: string;
}

interface UploadBody {
  file: File;
  filePart: ReactNativeFormDataFile;
  size: number;
  temporary: boolean;
}

interface ReactNativeFormDataFile {
  uri: string;
  name: string;
  type: string;
}

async function bodyFromArgs(args: UploadArgs): Promise<UploadBody> {
  if (args.fileUri) {
    const file = new File(args.fileUri);
    const size = await readableFileSize(file, args.size);
    return {
      file,
      filePart: { uri: args.fileUri, name: args.filename, type: args.mimeType },
      size,
      temporary: false,
    };
  }
  if (args.base64) {
    const file = writeBase64ToTemporaryFile(args.base64, args.filename);
    const size = await readableFileSize(file, undefined);
    return {
      file,
      filePart: { uri: file.uri, name: args.filename, type: args.mimeType },
      size,
      temporary: true,
    };
  }
  throw new Error("uploadFile requires base64 or fileUri");
}

function writeBase64ToTemporaryFile(base64: string, filename: string): File {
  const file = new File(Paths.cache, `trace-upload-${Date.now()}-${safeTempName(filename)}`);
  file.create({ overwrite: true });
  file.write(base64, { encoding: "base64" });
  return file;
}

function safeTempName(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "");
  return safe || "attachment";
}

async function readableFileSize(file: File, pickerSize: number | undefined): Promise<number> {
  if (typeof pickerSize === "number" && Number.isFinite(pickerSize) && pickerSize > 0) {
    return pickerSize;
  }
  if (file.size > 0) {
    return file.size;
  }
  const bytes = await file.bytes();
  if (bytes.byteLength <= 0) {
    throw new Error("Could not read picked file");
  }
  return bytes.byteLength;
}

async function blobFromFile(file: File, contentType: string): Promise<Blob> {
  const bytes = await file.bytes();
  if (bytes.byteLength <= 0) {
    throw new Error("Could not read picked file");
  }
  return new Blob([bytes], { type: contentType });
}

/**
 * Uploads a file to S3 via the presign endpoint and returns the S3 key.
 * Accepts either raw base64 (clipboard path) or a local URI (system picker
 * path). Reads bytes lazily so a URI-only attachment doesn't need base64
 * buffered in JS memory until send time.
 */
export async function uploadFile(args: UploadArgs): Promise<string> {
  const body = await bodyFromArgs(args);
  try {
    if (body.size > MAX_BYTES) {
      throw new Error("File must be 5MB or smaller");
    }

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
        filename: args.filename,
        contentType: args.mimeType,
        contentLength: body.size,
        organizationId: args.organizationId,
      }),
    });

    if (!presignResponse.ok) {
      throw new Error("Failed to create upload URL");
    }

    const { uploadUrl, uploadTarget, key } = (await presignResponse.json()) as {
      uploadUrl?: string;
      uploadTarget?: UploadTarget;
      key?: string;
    };
    if ((!uploadTarget && !uploadUrl) || !key) {
      throw new Error("Invalid upload response");
    }

    const uploadResponse = uploadTarget
      ? await uploadToTarget(uploadTarget, body, args.mimeType)
      : await fetch(uploadUrl as string, {
          method: "PUT",
          headers: { "Content-Type": args.mimeType },
          body: await blobFromFile(body.file, args.mimeType),
        });
    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file");
    }

    return key;
  } finally {
    cleanupUploadBody(body);
  }
}

export const uploadImage = uploadFile;

type UploadTarget =
  | { method: "PUT"; url: string }
  | { method: "POST"; url: string; fields: Record<string, string> };

async function uploadToTarget(
  target: UploadTarget,
  body: UploadBody,
  contentType: string,
): Promise<Response> {
  if (target.method === "POST") {
    const formData = new FormData();
    for (const [key, value] of Object.entries(target.fields)) {
      formData.append(key, value);
    }
    formData.append("file", body.filePart as unknown as Blob);
    return fetch(target.url, { method: "POST", body: formData });
  }

  const blob = await blobFromFile(body.file, contentType);
  return fetch(target.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
}

function cleanupUploadBody(body: UploadBody): void {
  if (!body.temporary) return;
  try {
    body.file.delete();
  } catch {
    // Cache cleanup is best-effort; failed deletes should not mask upload errors.
  }
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

export async function getUploadedFileDownloadUrl(key: string): Promise<string> {
  const apiUrl = getActiveApiUrl();
  if (!apiUrl) {
    throw new Error("No active Trace host is configured");
  }

  const response = await fetch(`${apiUrl}/uploads/url?download=1&key=${encodeURIComponent(key)}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to load file URL");
  }

  const { url } = (await response.json()) as { url?: string };
  if (!url) {
    throw new Error("Invalid file URL response");
  }

  return url;
}
