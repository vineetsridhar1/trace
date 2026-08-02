import { MediaArtifactUploadedCard } from "./MediaArtifactUploadedCard";
import { PlanArtifactUploadedCard } from "./PlanArtifactUploadedCard";

const SUPPORTED_ARTIFACT_TYPES = new Set([
  "trace.visual-plan.v1",
  "trace.image.v1",
  "trace.video.v1",
]);

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

  if (!SUPPORTED_ARTIFACT_TYPES.has(type)) return null;

  if (type === "trace.visual-plan.v1") {
    return (
      <PlanArtifactUploadedCard
        artifactId={artifactId}
        filePath={filePath}
        byteSize={byteSize}
        timestamp={timestamp}
      />
    );
  }

  const isImage = type === "trace.image.v1";
  return (
    <MediaArtifactUploadedCard
      artifactId={artifactId}
      filePath={filePath}
      mediaType={mediaType}
      byteSize={byteSize}
      kind={isImage ? "image" : "video"}
    />
  );
}
