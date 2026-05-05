export function extensionForMimeType(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower === "image/jpeg" || lower === "image/jpg") return "jpg";
  if (lower === "image/png") return "png";
  if (lower === "image/gif") return "gif";
  if (lower === "image/webp") return "webp";
  if (lower === "image/heic") return "heic";
  if (lower === "application/pdf") return "pdf";
  if (lower === "text/plain") return "txt";
  return "bin";
}

export function isPreviewableImageMimeType(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return (
    lower === "image/jpeg" ||
    lower === "image/jpg" ||
    lower === "image/png" ||
    lower === "image/gif" ||
    lower === "image/webp" ||
    lower === "image/heic" ||
    lower === "image/heif"
  );
}
