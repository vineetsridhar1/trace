import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getAuthHeaders } from "@trace/client-core";
import { getActiveApiUrl } from "@/lib/connection-target";

export interface MobileArtifactFile {
  path: string;
  mediaType: string;
  size: number;
}

export function artifactFileUrl(artifactId: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${getActiveApiUrl()}/artifacts/${encodeURIComponent(artifactId)}/files/${encodedPath}`;
}

export function artifactFileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "artifact";
}

export function formatArtifactFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isHtmlArtifactFile(file: Pick<MobileArtifactFile, "mediaType">): boolean {
  return file.mediaType === "text/html";
}

export function isImageArtifactFile(file: Pick<MobileArtifactFile, "mediaType">): boolean {
  return file.mediaType.startsWith("image/");
}

/** Downloads an authenticated artifact to the app cache for native preview or sharing. */
export async function downloadArtifactFile(
  artifactId: string,
  file: MobileArtifactFile,
): Promise<string> {
  const response = await fetch(artifactFileUrl(artifactId, file.path), {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Couldn't download this artifact.");

  const cacheFile = new File(
    Paths.cache,
    `artifact-${artifactId}-${Date.now()}-${artifactFileName(file.path)}`,
  );
  cacheFile.write(new Uint8Array(await response.arrayBuffer()));
  return cacheFile.uri;
}

/** Downloads an authenticated artifact to cache before invoking the native share/open sheet. */
export async function shareArtifactFile(
  artifactId: string,
  file: MobileArtifactFile,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  const uri = await downloadArtifactFile(artifactId, file);
  await Sharing.shareAsync(uri, {
    dialogTitle: `Open ${artifactFileName(file.path)}`,
    mimeType: file.mediaType,
  });
}
