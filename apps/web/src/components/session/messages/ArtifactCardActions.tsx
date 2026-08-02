import { ArrowRight, Download, MoreHorizontal } from "lucide-react";
import { artifactFileUrl } from "../../artifact/artifact-file-url";
import { useOpenArtifact } from "../../artifact/ArtifactOpenContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

export function ArtifactCardActions({
  artifactId,
  filePath,
  title,
  openLabel = "Open",
}: {
  artifactId: string;
  filePath?: string;
  title: string;
  openLabel?: string;
}) {
  const openArtifact = useOpenArtifact();
  const downloadUrl = filePath ? artifactFileUrl(artifactId, filePath) : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${title}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-surface-deep hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="size-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => openArtifact(artifactId)}>
            <ArrowRight /> {openLabel}
          </DropdownMenuItem>
          {downloadUrl ? (
            <DropdownMenuItem render={<a href={downloadUrl} download={filePath} />}>
              <Download /> Download
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={() => openArtifact(artifactId)}
        className="ml-1 flex min-h-10 shrink-0 items-center gap-2 rounded-[9px] bg-accent px-4 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
      >
        {openLabel} <ArrowRight className="size-4" />
      </button>
    </>
  );
}
