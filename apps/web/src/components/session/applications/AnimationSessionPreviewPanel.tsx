import { useState } from "react";
import { Code2, Play } from "lucide-react";
import { useEntityStore } from "@trace/client-core";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";
import { MonacoFileViewer } from "../MonacoFileViewer";
import { AppPreview } from "./AppPreview";
import { AppPreviewCanvasSkeleton } from "./AppPreviewCanvasSkeleton";
import { SavedAnimationPreview } from "./SavedAnimationPreview";
import { useProjectPreviewData } from "./useProjectPreviewData";
import { isLivePreviewRuntimeAvailable } from "./app-preview-readiness";

const ANIMATION_ENTRY_FILE = "src/Animation.tsx";

/**
 * Unlike an app session, an animation has no backend — once a commit is
 * pushed the container builds a self-contained static bundle that plays back
 * without a live runtime. So this panel prefers the live container (for HMR
 * feedback while the agent is actively working) but falls back to that saved
 * bundle once the container is gone, rather than a "starting up" skeleton.
 * The "Source" toggle is unaffected either way — it reads straight from git.
 */
export function AnimationSessionPreviewPanel({ sessionGroupId }: { sessionGroupId: string }) {
  const [view, setView] = useState<"preview" | "source">("preview");
  const { endpoint, error, refresh } = useProjectPreviewData(sessionGroupId, "animation");
  const previewUrl = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId]?.animationPreviewUrl as string | null | undefined,
  );
  const runtimeState = useEntityStore((s) => {
    const connection = s.sessionGroups[sessionGroupId]?.connection;
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
    return "state" in connection ? connection.state : null;
  });

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
        ) : endpoint && isLivePreviewRuntimeAvailable(runtimeState) ? (
          <AppPreview key={endpoint.id} endpointId={endpoint.id} status="running" fill desktopViewport />
        ) : previewUrl ? (
          <SavedAnimationPreview url={previewUrl} />
        ) : (
          <AppPreviewCanvasSkeleton error={error} onRetry={() => void refresh()} />
        )}
      </div>
    </div>
  );
}
