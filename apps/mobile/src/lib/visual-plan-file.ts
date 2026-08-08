import type { Artifact } from "@trace/gql";

export function visualPlanHtmlPath(artifact: Pick<Artifact, "manifest"> | null): string | null {
  return artifact?.manifest.files.find((file) => file.mediaType === "text/html")?.path ?? null;
}
