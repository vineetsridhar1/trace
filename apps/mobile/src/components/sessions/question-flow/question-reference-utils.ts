const EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const DEFAULT_REFERENCE_ACCEPT = "image/*,application/pdf";

export function acceptsQuestionReference(
  filename: string,
  mimeType: string,
  accept = DEFAULT_REFERENCE_ACCEPT,
): boolean {
  const normalizedName = filename.toLowerCase();
  const normalizedType = mimeType.toLowerCase();
  return splitAccept(accept).some((candidate) => {
    if (candidate.startsWith(".")) return normalizedName.endsWith(candidate);
    if (candidate.endsWith("/*")) return normalizedType.startsWith(candidate.slice(0, -1));
    return normalizedType === candidate;
  });
}

export function documentPickerTypes(accept = DEFAULT_REFERENCE_ACCEPT): string[] {
  return [
    ...new Set(
      splitAccept(accept)
        .map((candidate) => {
          if (candidate.startsWith(".")) return EXTENSION_MIME_TYPES[candidate];
          return candidate.includes("/") ? candidate : undefined;
        })
        .filter((candidate): candidate is string => Boolean(candidate)),
    ),
  ];
}

export function filenameFromReferenceUri(uri: string, fallback: string): string {
  const cleanUri = uri.split("?")[0] ?? uri;
  try {
    return decodeURIComponent(cleanUri).split("/").pop()?.trim() || fallback;
  } catch {
    return cleanUri.split("/").pop()?.trim() || fallback;
  }
}

function splitAccept(accept: string): string[] {
  return accept
    .split(",")
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(Boolean);
}
