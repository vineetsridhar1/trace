import type { Artifact } from "@trace/gql";
import { artifactDisplay } from "./artifact-display";
import { ArtifactContent } from "./ArtifactContent";

export function ArtifactSidecar({
  artifact,
  onPlanContent,
}: {
  artifact: Artifact;
  onPlanContent?: (content: string) => void;
}) {
  const { Icon, label } = artifactDisplay(artifact.type);
  const title = artifact.type === "trace.visual-plan.v1" ? "Implementation plan" : label;

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
        <ArtifactContent artifact={artifact} onPlanContent={onPlanContent} />
      </div>
    </aside>
  );
}
