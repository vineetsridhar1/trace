import { Download, Minus, Plus, RotateCw } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { PdfFormatFields } from "./PdfFormatFields";

export type PdfPageFormat = { width: number; height: number; unit: "mm" | "in" };
export type PdfDownloadState = "idle" | "waiting" | "generating";

export function PdfPreviewControls({
  format,
  onFormatChange,
  onDownload,
  onReload,
  onResetZoom,
  onZoomIn,
  onZoomOut,
  refreshing,
  zoom,
  downloadState = "idle",
  readOnly = false,
}: {
  format: PdfPageFormat;
  onFormatChange: (format: PdfPageFormat) => void;
  onDownload: () => void;
  onReload?: () => void;
  onResetZoom?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  refreshing?: boolean;
  zoom?: number;
  downloadState?: PdfDownloadState;
  readOnly?: boolean;
}) {
  const showCanvasControls = zoom !== undefined && onZoomIn && onZoomOut && onResetZoom && onReload;
  const downloading = downloadState !== "idle";

  return (
    <div
      className={cn(
        "grid h-10 shrink-0 items-center gap-3 border-b border-border bg-background px-3",
        readOnly ? "grid-cols-[auto_auto] justify-end" : "grid-cols-[minmax(0,1fr)_auto_auto]",
      )}
    >
      {!readOnly ? <PdfFormatFields format={format} onFormatChange={onFormatChange} /> : null}
      {showCanvasControls ? (
        <div className="flex items-center rounded-md border border-border bg-background/40 p-0.5">
          <Button
            size="icon-xs"
            variant="ghost"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={onZoomOut}
          >
            <Minus size={13} />
          </Button>
          <button
            type="button"
            title="Reset zoom"
            onClick={onResetZoom}
            className="min-w-10 px-1 text-[10px] tabular-nums text-muted-foreground hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            size="icon-xs"
            variant="ghost"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={onZoomIn}
          >
            <Plus size={13} />
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        {showCanvasControls ? (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onReload}
            disabled={refreshing}
            title="Reload preview"
            aria-label="Reload preview"
          >
            <RotateCw size={13} className={cn(refreshing && "animate-spin")} />
          </Button>
        ) : null}
        <Button size="sm" className="h-7" onClick={onDownload} disabled={downloading}>
          <Download size={13} className="mr-1" />
          {downloadState === "waiting"
            ? "Waiting for save…"
            : downloadState === "generating"
              ? "Generating…"
              : "Download PDF"}
        </Button>
      </div>
    </div>
  );
}
