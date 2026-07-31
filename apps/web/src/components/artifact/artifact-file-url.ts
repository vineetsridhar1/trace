const API_URL = import.meta.env.VITE_API_URL ?? "";

export function artifactFileUrl(artifactId: string, filePath: string): string {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `${API_URL}/artifacts/${encodeURIComponent(artifactId)}/files/${encodedPath}`;
}
