import { cn } from "../../../lib/utils";
import type { RefObject } from "react";
import type { PdfDownloadState, PdfPageFormat } from "./PdfPreviewControls";
import { PdfPreviewControls } from "./PdfPreviewControls";
import { AppPreviewFrameControls } from "./AppPreviewFrameControls";
import { AppPreviewLoadingBar } from "./AppPreviewLoadingBar";
import { AppPreviewToolbar } from "./AppPreviewToolbar";
import { SavedPreviewSkeleton } from "./SavedPreviewSkeleton";
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
  loadingKind,
  pdfFormat,
  pdfContentHeight,
  onPdfFormatChange,
  onPdfDownload,
  pdfDownloadState,
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
  loadingKind?: "design" | "pdf";
  pdfFormat?: PdfPageFormat;
  pdfContentHeight?: number;
  onPdfFormatChange?: (format: PdfPageFormat) => void;
  onPdfDownload?: () => void;
  pdfDownloadState?: PdfDownloadState;
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
  const canvasTranslation = {
    x: (viewport.canvasSize.width - viewport.displayedWidth) / 2 + viewport.pan.x,
    y: (viewport.canvasSize.height - viewport.displayedHeight) / 2 + viewport.pan.y,
  };

  return (
    <div className="relative flex h-full flex-col bg-surface-deep">
      {bare && pdfFormat && onPdfFormatChange && onPdfDownload ? (
        <PdfPreviewControls
          format={pdfFormat}
          onFormatChange={onPdfFormatChange}
          onDownload={onPdfDownload}
          downloadState={pdfDownloadState}
          refreshing={refreshing}
          onReload={onReload}
          zoom={viewport.zoom}
          onZoomIn={viewport.zoomIn}
          onZoomOut={viewport.zoomOut}
          onResetZoom={viewport.resetZoom}
        />
      ) : (
        <AppPreviewToolbar
          activePreset={viewport.activePreset}
          width={viewport.viewportSize.width}
          height={viewport.viewportSize.height}
          refreshing={refreshing}
          onReload={onReload}
          onSelectPreset={viewport.selectPreset}
        />
      )}

      <div
        ref={viewport.canvasRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          bare ? "cursor-grab touch-none bg-[#111113] active:cursor-grabbing" : "bg-surface-deep",
        )}
        onPointerDown={bare ? viewport.handleCanvasPointerDown : undefined}
        onPointerMove={bare ? viewport.handleCanvasPointerMove : undefined}
        onPointerUp={bare ? viewport.handleCanvasPointerEnd : undefined}
        onPointerCancel={bare ? viewport.handleCanvasPointerEnd : undefined}
        onWheel={bare ? viewport.handleCanvasWheel : undefined}
        style={{
          backgroundImage: bare
            ? "radial-gradient(rgba(113, 113, 122, 0.3) 1px, transparent 1px)"
            : "radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px)",
          backgroundSize: bare ? "24px 24px" : "16px 16px",
          backgroundPosition: bare
            ? `${canvasTranslation.x * 0.25}px ${canvasTranslation.y * 0.25}px`
            : undefined,
        }}
      >
        {viewport.ready ? (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${canvasTranslation.x}px, ${canvasTranslation.y}px)`,
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
              {!loaded && loadingKind ? (
                <SavedPreviewSkeleton kind={loadingKind} className="absolute inset-0 z-10" />
              ) : null}
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
