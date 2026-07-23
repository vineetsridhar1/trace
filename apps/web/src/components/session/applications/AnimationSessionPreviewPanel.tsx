import { useState } from "react";
import { Code2, Play } from "lucide-react";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";
import { MonacoFileViewer } from "../MonacoFileViewer";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { useProjectPreviewData } from "./useProjectPreviewData";

const ANIMATION_ENTRY_FILE = "src/Animation.tsx";

/**
 * The live preview is ephemeral (it only exists while the cloud runtime is
 * up), but the point of an animation session is to carry the interaction
 * into another codebase — so this panel also offers the entry component's
 * source, which round-trips through the same file-read/save/commit path
 * regular coding sessions use.
 */
export function AnimationSessionPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const [view, setView] = useState<"preview" | "source">("preview");
  const { endpoint, error, refresh } = useProjectPreviewData(sessionGroupId, "animation");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-border bg-surface-deep px-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={view === "preview"}
          onClick={() => setView("preview")}
          className={cn(view === "preview" && "bg-white/10")}
        >
          <Play size={12} />
          Preview
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={view === "source"}
          onClick={() => setView("source")}
          className={cn(view === "source" && "bg-white/10")}
        >
          <Code2 size={12} />
          Source
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {view === "source" ? (
          <MonacoFileViewer sessionGroupId={sessionGroupId} filePath={ANIMATION_ENTRY_FILE} />
        ) : endpoint ? (
          <AppPreview key={endpoint.id} endpointId={endpoint.id} status="running" fill desktopViewport />
        ) : (
          <AppPreviewCanvasSkeleton error={error} onRetry={() => void refresh()} />
        )}
      </div>
    </div>
  );
}
