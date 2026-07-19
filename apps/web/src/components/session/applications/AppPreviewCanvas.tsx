import { cn } from "../../../lib/utils";
import type { RefObject } from "react";
import type { PdfPageFormat } from "./PdfPreviewControls";
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
  bare = false,
  pdfFormat,
  pdfContentHeight,
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
  bare?: boolean;
  pdfFormat?: PdfPageFormat;
  pdfContentHeight?: number;
}) {
  const frameMargin = bare ? 0 : PREVIEW_FRAME_MARGIN;
  const pixelsPerUnit = pdfFormat?.unit === "in" ? 96 : 96 / 25.4;
  const viewport = usePreviewViewport(
    pdfFormat
      ? {
          width: pdfFormat.width * pixelsPerUnit,
          height: Math.max(pdfFormat.height * pixelsPerUnit, pdfContentHeight ?? 0),
        }
      : undefined,
    frameMargin,
  );

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
        showDeviceControls={!bare}
      />

      <div
        ref={viewport.canvasRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden bg-surface-deep",
          bare && "cursor-grab touch-none active:cursor-grabbing",
        )}
        onPointerDown={bare ? viewport.handleCanvasPointerDown : undefined}
        onPointerMove={bare ? viewport.handleCanvasPointerMove : undefined}
        onPointerUp={bare ? viewport.handleCanvasPointerEnd : undefined}
        onPointerCancel={bare ? viewport.handleCanvasPointerEnd : undefined}
        onWheel={bare ? viewport.handleCanvasWheel : undefined}
        style={{
          backgroundImage: bare
            ? "radial-gradient(#71717a 1px, transparent 1px)"
            : "radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px)",
          backgroundSize: bare ? "24px 24px" : "16px 16px",
        }}
      >
        {viewport.ready ? (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${(viewport.canvasSize.width - viewport.displayedWidth) / 2 + viewport.pan.x}px, ${(viewport.canvasSize.height - viewport.displayedHeight) / 2 + viewport.pan.y}px)`,
            }}
          >
            <div
              className={cn(
                "relative shrink-0 overflow-visible",
                bare
                  ? "bg-transparent p-0 shadow-none"
                  : "rounded-lg rounded-tl-none bg-background p-2 shadow-2xl",
                (viewport.resizing || viewport.panning) && "select-none",
              )}
              style={{
                width: viewport.displayedWidth + frameMargin * 2,
                height: viewport.displayedHeight + frameMargin * 2,
              }}
            >
              {!bare ? <AppPreviewFrameControls url={url} status={status} /> : null}
              {!loaded ? (
                <div className="absolute left-2 right-2 top-1.5 z-20">
                  <AppPreviewLoadingBar />
                </div>
              ) : null}
              <div
                className={cn(
                  "size-full overflow-hidden",
                  bare ? "bg-transparent" : "rounded-md bg-muted/20",
                )}
              >
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
                      bare && "pointer-events-none",
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
              {!bare ? (
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
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
