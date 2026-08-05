import { useEntityStore } from "@trace/client-core";
import { VisualPlanArtifact } from "./VisualPlanArtifact";

interface ArtifactTabContentProps {
  artifactId: string;
}

export function ArtifactTabContent({ artifactId }: ArtifactTabContentProps) {
  const artifact = useEntityStore((state) => state.artifacts[artifactId]);

  if (!artifact) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Plan artifact unavailable
      </div>
    );
  }

  return <VisualPlanArtifact artifact={artifact} />;
}
