import { Download, FileArchive } from "lucide-react";
import { artifactFileUrl } from "../../artifact/artifact-file-url";
import { useOpenArtifact } from "../../artifact/ArtifactOpenContext";
import { ArtifactCardActions } from "./ArtifactCardActions";
import { artifactFileName, formatArtifactBytes } from "./artifact-card-utils";

export function GenericArtifactUploadedCard({
  artifactId,
  filePath,
  mediaType,
  byteSize,
}: {
  artifactId: string;
  filePath?: string;
  mediaType?: string;
  byteSize?: number;
}) {
  const openArtifact = useOpenArtifact();
  const displayName = artifactFileName(filePath, "Artifact");
  const size = formatArtifactBytes(byteSize);
  const fileType = mediaType?.split("/").at(-1)?.toUpperCase() ?? "FILE";

  return (
    <article className="w-full overflow-hidden rounded-[14px] border border-[#2d3138] bg-[#171a1f] shadow-[0_18px_48px_rgb(0_0_0/0.28)]">
      <button
        type="button"
        onClick={() => openArtifact(artifactId)}
        className="flex min-h-28 w-full items-center gap-4 border-b border-[#2d3138] bg-[#0d0f12] p-4 text-left transition-colors hover:bg-[#11141a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#2d3138] bg-[#171a1f]">
          <FileArchive className="size-5 text-accent" />
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
            Artifact uploaded
          </span>
          <span className="mt-1 block truncate text-[14px] font-semibold text-[#f1f3f5]">
            {displayName}
          </span>
          <span className="mt-1 block text-[11px] text-[#9ba1aa]">
            {fileType}
            {size ? ` · ${size}` : ""}
          </span>
        </span>
      </button>
      <div className="flex items-center gap-3 p-3">
        <p className="min-w-0 flex-1 truncate text-[11px] text-[#9ba1aa]">
          This file is ready to open or download.
        </p>
        {filePath ? (
          <a
            href={artifactFileUrl(artifactId, filePath)}
            download={displayName}
            aria-label={`Download ${displayName}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#2d3138] text-[#9ba1aa] transition-colors hover:bg-[#0d0f12] hover:text-[#f1f3f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-3.5" />
          </a>
        ) : null}
        <ArtifactCardActions artifactId={artifactId} openLabel="Open artifact" />
      </div>
    </article>
  );
}
