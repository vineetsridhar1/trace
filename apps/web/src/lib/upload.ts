import { getAuthHeaders } from "../stores/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export async function uploadImage(file: File, organizationId?: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }

  const presignResponse = await fetch(`${API_URL}/uploads/presign`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
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
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload image");
  }

  return key;
}
