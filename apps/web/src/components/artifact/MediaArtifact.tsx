import type { Artifact } from "@trace/gql";
import { artifactFileUrl } from "./artifact-file-url";
import { ImageContextMenu } from "../shared/ImageContextMenu";

export function MediaArtifact({ artifact }: { artifact: Artifact }) {
  const file = artifact.manifest.files.find((candidate) =>
    artifact.type === "trace.image.v1"
      ? candidate.mediaType.startsWith("image/")
      : candidate.mediaType.startsWith("video/"),
  );
  if (!file) return <p className="p-5 text-sm text-muted-foreground">No previewable file.</p>;
  const src = artifactFileUrl(artifact.id, file.path);

  return artifact.type === "trace.image.v1" ? (
    <ImageContextMenu src={src}>
      <img src={src} alt={artifact.key} className="h-auto max-h-full w-full object-contain p-4" />
    </ImageContextMenu>
  ) : (
    <video src={src} controls className="h-auto max-h-full w-full p-4">
      <track kind="captions" />
    </video>
  );
}
