import { Archive } from "lucide-react";
import { useEffect, useState } from "react";
import { SavedPreviewSkeleton } from "./SavedPreviewSkeleton";

export function SavedAnimationPreview({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [url]);

  return (
    <div className="relative h-full bg-surface-deep">
      {loading ? <SavedPreviewSkeleton kind="design" /> : null}
      {!loading ? (
        <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
          <Archive className="size-3.5" />
          <span>Saved version · runtime paused</span>
        </div>
      ) : null}
      <iframe
        src={url}
        title="Saved animation preview"
        className={
          loading ? "absolute left-0 top-0 size-px opacity-0" : "size-full border-0 bg-background"
        }
        sandbox="allow-scripts"
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
