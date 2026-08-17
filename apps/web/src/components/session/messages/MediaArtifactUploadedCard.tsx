import { Image, Video } from "lucide-react";
import { artifactFileUrl } from "../../artifact/artifact-file-url";
import { useOpenArtifact } from "../../artifact/ArtifactOpenContext";
import { ArtifactCardActions } from "./ArtifactCardActions";
import { artifactFileName, formatArtifactBytes } from "./artifact-card-utils";

export function MediaArtifactUploadedCard({
  artifactId,
  filePath,
  mediaType,
  byteSize,
  kind,
}: {
  artifactId: string;
  filePath?: string;
  mediaType?: string;
  byteSize?: number;
  kind: "image" | "video";
}) {
  const openArtifact = useOpenArtifact();
  const displayName = artifactFileName(filePath, "Media");
  const size = formatArtifactBytes(byteSize);
  const mediaUrl = filePath ? artifactFileUrl(artifactId, filePath) : undefined;
  const isImage = kind === "image";

  return (
    <article className="w-full overflow-hidden rounded-[14px] border border-border bg-surface-elevated shadow-xl">
      <button
        type="button"
        onClick={() => openArtifact(artifactId)}
        className="relative block h-44 w-full overflow-hidden border-b border-border bg-surface-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {mediaUrl ? (
          isImage ? (
            <img src={mediaUrl} alt={displayName} className="size-full object-cover" />
          ) : (
            <video src={mediaUrl} muted preload="metadata" className="size-full object-cover" />
          )
        ) : null}
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-border bg-surface-deep/90 px-2.5 py-1 text-[10px] font-semibold uppercase text-foreground">
          {isImage ? (
            <Image className="size-3.5 text-accent" />
          ) : (
            <Video className="size-3.5 text-accent" />
          )}
          {isImage ? mediaType?.split("/")[1] || "Image" : "Video"}
        </span>
        {!isImage ? (
          <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg">
            <span className="ml-0.5 text-base">▶</span>
          </span>
        ) : null}
      </button>
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold text-foreground">{displayName}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isImage ? "Image" : "Video"}
            {size ? ` · ${size}` : ""}
          </p>
        </div>
        <ArtifactCardActions artifactId={artifactId} />
      </div>
    </article>
  );
}
