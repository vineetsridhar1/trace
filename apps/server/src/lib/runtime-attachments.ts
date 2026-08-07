export function rewriteRuntimeAttachmentUrl(
  url: string,
  options: {
    hosting: string | null | undefined;
    storageMode: string | undefined;
    cloudStoragePublicUrl: string | undefined;
  },
): string {
  if (options.hosting !== "cloud" || options.storageMode !== "local") return url;
  const cloudStorageUrl = options.cloudStoragePublicUrl?.trim();
  if (!cloudStorageUrl) {
    throw new Error("TRACE_CLOUD_STORAGE_PUBLIC_URL is required for cloud attachments");
  }

  try {
    const source = new URL(url);
    const target = new URL(cloudStorageUrl);
    source.protocol = target.protocol;
    source.host = target.host;
    return source.toString();
  } catch {
    throw new Error("Unable to construct a container-reachable cloud attachment URL");
  }
}
