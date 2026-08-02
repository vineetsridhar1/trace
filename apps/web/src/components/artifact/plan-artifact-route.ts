const PLAN_ARTIFACT_PATH = /^\/plans\/([^/]+)\/?$/;

export function planArtifactPath(artifactId: string): string {
  return `/plans/${encodeURIComponent(artifactId)}`;
}

export function planArtifactIdFromPath(pathname: string): string | null {
  const match = pathname.match(PLAN_ARTIFACT_PATH);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
