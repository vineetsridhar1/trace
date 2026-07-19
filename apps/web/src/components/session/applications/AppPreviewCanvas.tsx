import { cn } from "../../../lib/utils";
import type { RefObject } from "react";
import { AppPreviewFrameControls } from "./AppPreviewFrameControls";
import { AppPreviewLoadingBar } from "./AppPreviewLoadingBar";
import { AppPreviewToolbar } from "./AppPreviewToolbar";
import { PREVIEW_FRAME_MARGIN, usePreviewViewport } from "./usePreviewViewport";

export function AppPreviewCanvas({
  url,
  title,
  frameRevision,
  loaded,
  refreshing,
  status,
  onLoad,
  onReload,
  iframeRef,
}: {
  url: string | null;
  title: string;
  frameRevision: number;
  loaded: boolean;
  refreshing: boolean;
  status: string;
  onLoad: () => void;
  onReload: () => void;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}) {
  const viewport = usePreviewViewport();

  return (
    <div className="relative flex h-full flex-col bg-surface-deep">
      <AppPreviewToolbar
        activePreset={viewport.activePreset}
        width={viewport.viewportSize.width}
        height={viewport.viewportSize.height}
        refreshing={refreshing}
        onReload={onReload}
        onSelectPreset={viewport.selectPreset}
        zoom={viewport.zoom}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onResetZoom={viewport.resetZoom}
      />

      <div
        ref={viewport.canvasRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-surface-deep"
        style={{
          backgroundImage: "radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        {viewport.ready ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div
              className={cn(
                "relative shrink-0 overflow-visible rounded-lg rounded-tl-none bg-background p-2 shadow-2xl",
                viewport.resizing && "select-none",
              )}
              style={{
                width: viewport.displayedWidth + PREVIEW_FRAME_MARGIN * 2,
                height: viewport.displayedHeight + PREVIEW_FRAME_MARGIN * 2,
              }}
            >
              <AppPreviewFrameControls url={url} status={status} />
              {!loaded ? (
                <div className="absolute left-2 right-2 top-1.5 z-20">
                  <AppPreviewLoadingBar />
                </div>
              ) : null}
              <div className="size-full overflow-hidden rounded-md bg-muted/20">
                {url ? (
                  <iframe
                    ref={iframeRef}
                    key={frameRevision}
                    src={url}
                    title={title}
                    onLoad={onLoad}
                    className={cn(
                      "block origin-top-left border-0 bg-background",
                      !loaded && "opacity-0",
                      viewport.resizing && "pointer-events-none",
                    )}
                    style={{
                      width: viewport.viewportSize.width,
                      height: viewport.viewportSize.height,
                      transform: `scale(${viewport.scale})`,
                    }}
                    sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                  />
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Resize preview"
                title="Drag to resize preview"
                onKeyDown={viewport.handleResizeKeyDown}
                onPointerDown={viewport.handleResizeStart}
                onPointerMove={viewport.handleResizeMove}
                onPointerUp={viewport.handleResizeEnd}
                onPointerCancel={viewport.handleResizeEnd}
                className="absolute -bottom-2 -right-2 z-10 size-4 cursor-nwse-resize touch-none rounded-full border border-border bg-foreground shadow-sm transition-transform hover:scale-125"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
