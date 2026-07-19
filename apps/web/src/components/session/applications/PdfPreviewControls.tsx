import { Download, Minus, Plus, RotateCw } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { PdfFormatFields } from "./PdfFormatFields";

export type PdfPageFormat = { width: number; height: number; unit: "mm" | "in" };

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
}) {
  const showCanvasControls =
    zoom !== undefined && onZoomIn && onZoomOut && onResetZoom && onReload;

  return (
    <div className="grid h-10 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border bg-background px-3">
      <PdfFormatFields format={format} onFormatChange={onFormatChange} />
      {showCanvasControls ? (
        <div className="flex items-center rounded-md border border-border bg-background/40 p-0.5">
          <Button size="icon-xs" variant="ghost" title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}>
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
          <Button size="icon-xs" variant="ghost" title="Zoom in" aria-label="Zoom in" onClick={onZoomIn}>
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
        <Button size="sm" className="h-7" onClick={onDownload}>
          <Download size={13} className="mr-1" />
          Download PDF
        </Button>
      </div>
    </div>
  );
}
