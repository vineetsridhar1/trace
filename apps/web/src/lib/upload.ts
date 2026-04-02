import { getAuthHeaders } from "../stores/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
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

export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }

  const filename = sanitizeFilename(file.name);
  const presignResponse = await fetch(`${API_URL}/uploads/presign`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      filename,
      contentType: file.type,
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
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload image");
  }

  return key;
}
