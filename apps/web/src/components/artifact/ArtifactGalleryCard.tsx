import { useEntityField } from "@trace/client-core";
import { cn } from "../../lib/utils";
import { artifactDisplay } from "./artifact-display";
import { artifactFileUrl } from "./artifact-file-url";

export function ArtifactGalleryCard({
  artifactId,
  onOpen,
}: {
  artifactId: string;
  onOpen: (artifactId: string) => void;
}) {
  const type = useEntityField("artifacts", artifactId, "type");
  const key = useEntityField("artifacts", artifactId, "key");
  const manifest = useEntityField("artifacts", artifactId, "manifest");
  const sessionId = useEntityField("artifacts", artifactId, "sessionId");
  const sessionName = useEntityField("sessions", sessionId ?? "", "name");
  if (!type || !manifest) return null;

  const { Icon, label } = artifactDisplay(type);
  const preview = manifest.files.find((file) => file.mediaType.startsWith("image/"));

  return (
    <button
      type="button"
      onClick={() => onOpen(artifactId)}
      className="group overflow-hidden rounded-lg border border-border bg-surface-elevated text-left transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="aspect-[16/10] overflow-hidden bg-surface-deep">
        {preview ? (
          <img
            src={artifactFileUrl(artifactId, preview.path)}
            alt={key ?? label}
            className="size-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "flex size-full flex-col items-center justify-center gap-2 text-muted-foreground",
              "bg-[radial-gradient(rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:16px_16px]",
            )}
          >
            <Icon className="size-7" />
            <span className="text-xs">{label}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {sessionName ?? key}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      </div>
    </button>
  );
}
