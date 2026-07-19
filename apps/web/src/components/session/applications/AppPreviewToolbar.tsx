import { Minus, Monitor, Plus, RotateCw, Smartphone } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import type { PreviewPreset } from "./usePreviewViewport";

export function AppPreviewToolbar({
  activePreset,
  height,
  refreshing,
  width,
  onReload,
  onSelectPreset,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: {
  activePreset: PreviewPreset | null;
  height: number;
  refreshing: boolean;
  width: number;
  onReload: () => void;
  onSelectPreset: (preset: PreviewPreset) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
      <span className="text-xs tabular-nums text-muted-foreground">
        {width} × {height}
      </span>
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
          <Button
            size="icon-xs"
            variant="ghost"
            title="Desktop preview"
            aria-label="Desktop preview"
            aria-pressed={activePreset === "desktop"}
            className={cn(activePreset === "desktop" && "bg-surface-hover text-foreground")}
            onClick={() => onSelectPreset("desktop")}
          >
            <Monitor size={13} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            title="Mobile preview"
            aria-label="Mobile preview"
            aria-pressed={activePreset === "mobile"}
            className={cn(activePreset === "mobile" && "bg-surface-hover text-foreground")}
            onClick={() => onSelectPreset("mobile")}
          >
            <Smartphone size={13} />
          </Button>
        </div>
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
      </div>
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
    </div>
  );
}
