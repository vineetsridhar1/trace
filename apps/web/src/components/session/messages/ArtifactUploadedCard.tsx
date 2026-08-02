import { useEntityField } from "@trace/client-core";
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
  timestamp,
}: {
  artifactId: string;
  artifactType?: string;
  timestamp: string;
}) {
  const storedType = useEntityField("artifacts", artifactId, "type");
  const manifest = useEntityField("artifacts", artifactId, "manifest");
  const byteSize = useEntityField("artifacts", artifactId, "byteSize");
  const type = storedType ?? artifactType ?? "trace.visual-plan.v1";

  if (!SUPPORTED_ARTIFACT_TYPES.has(type)) return null;

  if (type === "trace.visual-plan.v1") {
    const file = manifest?.files.find(
      (candidate) => candidate.path === "plan.html" || candidate.path === "plan.mdx",
    );
    return (
      <PlanArtifactUploadedCard
        artifactId={artifactId}
        filePath={file?.path}
        byteSize={byteSize ?? file?.size}
        timestamp={timestamp}
      />
    );
  }

  const isImage = type === "trace.image.v1";
  const file = manifest?.files.find((candidate) =>
    candidate.mediaType.startsWith(isImage ? "image/" : "video/"),
  );
  return (
    <MediaArtifactUploadedCard
      artifactId={artifactId}
      filePath={file?.path}
      mediaType={file?.mediaType}
      byteSize={byteSize ?? file?.size}
      kind={isImage ? "image" : "video"}
    />
  );
}
