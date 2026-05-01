import { getAuthHeaders } from "@trace/client-core";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export async function uploadFile(file: File, organizationId?: string): Promise<string> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File must be 5MB or smaller");
  }

  const contentType = file.type || "application/octet-stream";
  const presignResponse = await fetch(`${API_URL}/uploads/presign`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      organizationId,
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
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload file");
  }

  return key;
}

export const uploadImage = uploadFile;
