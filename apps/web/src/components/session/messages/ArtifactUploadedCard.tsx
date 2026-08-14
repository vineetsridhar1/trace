import { Image, Video } from "lucide-react";
import { artifactFileUrl } from "../../artifact/artifact-file-url";
import { useOpenArtifact } from "../../artifact/ArtifactOpenContext";

export function ArtifactUploadedCard({
  artifactId,
  artifactType,
  filePath,
  mediaType,
  byteSize,
}: {
  artifactId: string;
  artifactType: string;
  filePath?: string;
  mediaType?: string;
  byteSize?: number;
  timestamp: string;
}) {
  const openArtifact = useOpenArtifact();
  if (artifactType !== "trace.image.v1" && artifactType !== "trace.video.v1") return null;

  const isImage = artifactType === "trace.image.v1";
  const displayName = filePath?.split("/").at(-1) ?? (isImage ? "Image" : "Video");
  const mediaUrl = filePath ? artifactFileUrl(artifactId, filePath) : undefined;
  const size =
    typeof byteSize === "number"
      ? `${byteSize < 1024 * 1024 ? Math.ceil(byteSize / 1024) + " KB" : (byteSize / 1024 / 1024).toFixed(1) + " MB"}`
      : null;

  return (
    <article className="w-full overflow-hidden rounded-[14px] border border-border bg-surface-elevated shadow-lg">
      <button
        type="button"
        onClick={() => openArtifact(artifactId)}
        className="relative block h-44 w-full overflow-hidden border-b border-border bg-surface-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {mediaUrl ? (
          isImage ? (
            <img src={mediaUrl} alt={displayName} className="size-full object-cover" />
          ) : (
            <video src={mediaUrl} muted preload="metadata" className="size-full object-cover">
              <track kind="captions" />
            </video>
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
      </button>
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold text-foreground">{displayName}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isImage ? "Image" : "Video"}
            {size ? ` · ${size}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openArtifact(artifactId)}
          className="h-8 shrink-0 rounded-lg bg-accent px-3 text-[11px] font-semibold text-accent-foreground hover:opacity-90"
        >
          Open
        </button>
      </div>
    </article>
  );
}
