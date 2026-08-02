import { FileText } from "lucide-react";
import { Button } from "../../ui/button";
import { useOpenArtifact } from "../../artifact/ArtifactOpenContext";
import { formatTime } from "./utils";

export function ArtifactUploadedCard({
  artifactId,
  timestamp,
}: {
  artifactId: string;
  timestamp: string;
}) {
  const openArtifact = useOpenArtifact();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <FileText className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Artifact uploaded</p>
        <p className="text-xs text-muted-foreground">Implementation plan</p>
      </div>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {formatTime(timestamp)}
      </span>
      <Button variant="outline" size="sm" onClick={() => openArtifact(artifactId)}>
        View
      </Button>
    </div>
  );
}
