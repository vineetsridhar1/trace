import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Copy, ExternalLink, Globe, Loader2, Play, Square } from "lucide-react";
import type { Preview } from "@trace/gql";
import {
  SESSION_PREVIEWS_QUERY,
  STOP_PREVIEW_MUTATION,
  useEntitiesByIds,
  useEntityStore,
  usePreviewIdsForSession,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { CreatePreviewDialog } from "./CreatePreviewDialog";

const ACTIVE_STATUSES = new Set(["starting", "ready", "stopping"]);

export function SessionPreviewButton({ sessionId }: { sessionId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previewIds = usePreviewIdsForSession(sessionId);
  const previews = useEntitiesByIds("previews", previewIds).filter(
    (preview): preview is Preview => preview !== null,
  );
  const activePreview = useMemo(
    () => previews.find((preview) => ACTIVE_STATUSES.has(preview.status)) ?? previews[0] ?? null,
    [previews],
  );

  useEffect(() => {
    let cancelled = false;
    client
      .query(SESSION_PREVIEWS_QUERY, { sessionId })
      .toPromise()
      .then((result) => {
        if (cancelled || !result.data?.sessionPreviews) return;
        useEntityStore.getState().upsertMany("previews", result.data.sessionPreviews as Preview[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const handleStop = async (previewId: string) => {
    setStoppingId(previewId);
    await client.mutation(STOP_PREVIEW_MUTATION, { id: previewId }).toPromise();
    setStoppingId(null);
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
  };

  const hasReadyUrl = activePreview?.status === "ready" && activePreview.url;
  const icon =
    activePreview?.status === "starting" || activePreview?.status === "stopping" ? (
      <Loader2 size={14} className="animate-spin" />
    ) : activePreview?.status === "failed" ? (
      <AlertCircle size={14} />
    ) : (
      <Globe size={14} />
    );

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          if (activePreview) {
            setMenuOpen((open) => !open);
          } else {
            setDialogOpen(true);
          }
        }}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
          hasReadyUrl
            ? "text-foreground bg-surface-elevated"
            : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
        }`}
        title="Preview"
      >
        {icon}
      </button>

      {menuOpen && activePreview && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Preview</p>
              <p className="truncate text-xs text-muted-foreground">{statusText(activePreview)}</p>
            </div>
            <Button size="xs" variant="outline" onClick={() => setDialogOpen(true)}>
              <Play size={12} />
              New
            </Button>
          </div>

          {activePreview.url && (
            <p className="mb-3 truncate rounded-md bg-surface-elevated px-2 py-1.5 text-xs text-muted-foreground">
              {activePreview.url}
            </p>
          )}

          {activePreview.lastError && (
            <p className="mb-3 text-xs text-destructive">{activePreview.lastError}</p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!activePreview.url}
              onClick={() => activePreview.url && window.open(activePreview.url, "_blank")}
            >
              <ExternalLink size={13} />
              Open
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!activePreview.url}
              onClick={() => activePreview.url && handleCopy(activePreview.url)}
            >
              <Copy size={13} />
              Copy
            </Button>
            {ACTIVE_STATUSES.has(activePreview.status) && (
              <Button
                size="sm"
                variant="destructive"
                disabled={stoppingId === activePreview.id}
                onClick={() => handleStop(activePreview.id)}
              >
                {stoppingId === activePreview.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Square size={13} />
                )}
                Stop
              </Button>
            )}
          </div>
        </div>
      )}

      <CreatePreviewDialog sessionId={sessionId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function statusText(preview: Preview): string {
  if (preview.status === "ready") return `Ready on port ${preview.port}`;
  if (preview.status === "starting") return `Starting ${preview.command}`;
  if (preview.status === "stopping") return "Stopping";
  if (preview.status === "failed") return "Failed";
  return "Stopped";
}
