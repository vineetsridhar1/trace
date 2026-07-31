import { FileArchive, Image, Video } from "lucide-react";
import type { Artifact } from "@trace/gql";
import { MediaArtifact } from "./MediaArtifact";
import { VisualPlanArtifact } from "./VisualPlanArtifact";

export function ArtifactSidecar({
  artifact,
  onPlanContent,
}: {
  artifact: Artifact;
  onPlanContent?: (content: string) => void;
}) {
  const title =
    artifact.type === "trace.visual-plan.v1"
      ? "Implementation plan"
      : artifact.type === "trace.image.v1"
        ? "Image"
        : artifact.type === "trace.video.v1"
          ? "Video"
          : "Artifact";
  const Icon =
    artifact.type === "trace.image.v1"
      ? Image
      : artifact.type === "trace.video.v1"
        ? Video
        : FileArchive;

  return (
    <aside className="absolute inset-y-0 right-0 z-10 flex w-[min(46rem,45vw)] flex-col border-l border-border bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
        <Icon size={15} className="text-accent" />
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {artifact.manifest.files.length} {artifact.manifest.files.length === 1 ? "file" : "files"}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {artifact.type === "trace.visual-plan.v1" ? (
          <VisualPlanArtifact artifact={artifact} onContent={onPlanContent} />
        ) : artifact.type === "trace.image.v1" || artifact.type === "trace.video.v1" ? (
          <MediaArtifact artifact={artifact} />
        ) : (
          <div className="space-y-2 p-5">
            {artifact.manifest.files.map((file) => (
              <div key={file.path} className="rounded-md border border-border px-3 py-2 text-sm">
                {file.path}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
