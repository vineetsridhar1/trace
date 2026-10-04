import { GenericArtifactUploadedCard } from "./GenericArtifactUploadedCard";
import { MediaArtifactUploadedCard } from "./MediaArtifactUploadedCard";
import { PlanArtifactUploadedCard } from "./PlanArtifactUploadedCard";

export function ArtifactUploadedCard({
  artifactId,
  artifactType,
  filePath,
  mediaType,
  byteSize,
  timestamp,
}: {
  artifactId: string;
  artifactType?: string;
  filePath?: string;
  mediaType?: string;
  byteSize?: number;
  timestamp: string;
}) {
  const type = artifactType ?? "trace.visual-plan.v1";

  if (type === "trace.visual-plan.v1") {
    return (
      <PlanArtifactUploadedCard artifactId={artifactId} filePath={filePath} timestamp={timestamp} />
    );
  }

  if (type === "trace.image.v1" || type === "trace.video.v1") {
    return (
      <MediaArtifactUploadedCard
        artifactId={artifactId}
        filePath={filePath}
        mediaType={mediaType}
        byteSize={byteSize}
        kind={type === "trace.image.v1" ? "image" : "video"}
      />
    );
  }

  return (
    <GenericArtifactUploadedCard
      artifactId={artifactId}
      filePath={filePath}
      mediaType={mediaType}
      byteSize={byteSize}
    />
  );
}
