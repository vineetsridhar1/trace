import { ArrowRight } from "lucide-react";
import { useOpenArtifact } from "../../artifact/ArtifactOpenContext";

export function ArtifactCardActions({
  artifactId,
  openLabel = "Open",
  onOpen,
}: {
  artifactId: string;
  openLabel?: string;
  onOpen?: () => void;
}) {
  const openArtifact = useOpenArtifact();
  const handleOpen = onOpen ?? (() => openArtifact(artifactId));

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
    >
      {openLabel} <ArrowRight className="size-3.5" />
    </button>
  );
}
