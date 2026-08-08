import { useEntityStore } from "@trace/client-core";
import { ArtifactContent } from "./ArtifactContent";

interface ArtifactTabContentProps {
  artifactId: string;
}

export function ArtifactTabContent({ artifactId }: ArtifactTabContentProps) {
  const artifact = useEntityStore((state) => state.artifacts[artifactId]);

  if (!artifact) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Artifact unavailable
      </div>
    );
  }

  return <ArtifactContent artifact={artifact} />;
}
