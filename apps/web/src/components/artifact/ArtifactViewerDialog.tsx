import { useEntityStore } from "@trace/client-core";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
} from "../ui/responsive-dialog";
import { artifactDisplay } from "./artifact-display";
import { MediaArtifact } from "./MediaArtifact";
import { VisualPlanArtifact } from "./VisualPlanArtifact";

export function ArtifactViewerDialog({
  artifactId,
  onOpenChange,
}: {
  artifactId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const artifact = useEntityStore((state) =>
    artifactId ? state.artifacts[artifactId] : undefined,
  );
  if (!artifact) return null;

  const { label } = artifactDisplay(artifact.type);
  const isMedia = artifact.type === "trace.image.v1" || artifact.type === "trace.video.v1";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {artifact.key} · {artifact.manifest.files.length}{" "}
            {artifact.manifest.files.length === 1 ? "file" : "files"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {artifact.type === "trace.visual-plan.v1" ? (
            <VisualPlanArtifact artifact={artifact} />
          ) : isMedia ? (
            <MediaArtifact artifact={artifact} />
          ) : (
            <div className="space-y-2 py-2">
              {artifact.manifest.files.map((file) => (
                <div key={file.path} className="rounded-md border border-border px-3 py-2 text-sm">
                  {file.path}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
