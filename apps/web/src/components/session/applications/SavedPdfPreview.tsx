import { useEffect, useMemo, useRef, useState } from "react";
import { TraceLoader } from "@/components/ui/trace-loader";
import { PdfPreviewControls } from "./PdfPreviewControls";
import { layoutSavedPdfPages, type SavedPdfPage } from "./saved-pdf-layout";
import { usePreviewViewport } from "./usePreviewViewport";

const PAGE_GAP = 24;
const RENDER_SCALE = 1.5;

export function SavedPdfPreview({ downloadUrl, url }: { downloadUrl: string | null; url: string }) {
  const pageCanvasesRef = useRef(new Map<number, HTMLCanvasElement>());
  const documentRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<import("pdfjs-dist").PDFDocumentLoadingTask | null>(null);
  const [pages, setPages] = useState<SavedPdfPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [rendering, setRendering] = useState(true);
  const pageLayout = useMemo(
    () => (pages.length > 0 ? layoutSavedPdfPages(pages, PAGE_GAP) : undefined),
    [pages],
  );
  const viewport = usePreviewViewport(pageLayout, 0);
  const contentTranslation = {
    x: (viewport.canvasSize.width - viewport.displayedWidth) / 2 + viewport.pan.x,
    y: (viewport.canvasSize.height - viewport.displayedHeight) / 2 + viewport.pan.y,
  };

  useEffect(() => {
    let active = true;
    setPages([]);
    setError(null);
    setRendering(true);

    void import("pdfjs-dist")
      .then(async ({ getDocument, GlobalWorkerOptions }) => {
        if (!active) return;
        GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const loadingTask = getDocument({ url });
        loadingTaskRef.current = loadingTask;
        const document = await loadingTask.promise;
        if (!active) return;
        documentRef.current = document;
        const nextPages = await Promise.all(
          Array.from({ length: document.numPages }, async (_, index) => {
            const page = await document.getPage(index + 1);
            const pageViewport = page.getViewport({ scale: 1 });
            return { width: pageViewport.width, height: pageViewport.height };
          }),
        );
        if (active) setPages(nextPages);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load this PDF");
          setRendering(false);
        }
      });

    return () => {
      active = false;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      documentRef.current = null;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [revision, url]);

  useEffect(() => {
    const document = documentRef.current;
    if (!document || pages.length === 0) return;
    let active = true;

    void (async () => {
      for (let index = 0; index < pages.length; index += 1) {
        const canvas = pageCanvasesRef.current.get(index);
        if (!canvas) continue;
        const page = await document.getPage(index + 1);
        const pageViewport = page.getViewport({ scale: RENDER_SCALE });
        canvas.width = Math.ceil(pageViewport.width);
        canvas.height = Math.ceil(pageViewport.height);
        await page.render({ canvas, viewport: pageViewport }).promise;
      }
    })()
      .then(() => {
        if (active) setRendering(false);
      })
      .catch((renderError: unknown) => {
        if (active) {
          setError(
            renderError instanceof Error ? renderError.message : "Unable to render this PDF",
          );
          setRendering(false);
        }
      });

    return () => {
      active = false;
    };
  }, [pages]);

  return (
    <div className="flex h-full flex-col bg-surface-deep">
      <PdfPreviewControls
        readOnly
        showDownload={Boolean(downloadUrl)}
        onDownload={() => {
          if (downloadUrl) window.location.assign(downloadUrl);
        }}
        refreshing={rendering}
        onReload={() => setRevision((value) => value + 1)}
        zoom={viewport.zoom}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onResetZoom={viewport.resetZoom}
      />
      <div
        ref={viewport.canvasRef}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden bg-[#111113] active:cursor-grabbing"
        onPointerDown={viewport.handleCanvasPointerDown}
        onPointerMove={viewport.handleCanvasPointerMove}
        onPointerUp={viewport.handleCanvasPointerEnd}
        onPointerCancel={viewport.handleCanvasPointerEnd}
        onWheel={viewport.handleCanvasWheel}
        style={{
          backgroundImage: "radial-gradient(rgba(113, 113, 122, 0.3) 1px, transparent 1px)",
          backgroundPosition: `${contentTranslation.x * 0.25}px ${contentTranslation.y * 0.25}px`,
          backgroundSize: "24px 24px",
        }}
      >
        {error ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {rendering && !error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <TraceLoader size={18} showLabel={false} />
          </div>
        ) : null}
        {viewport.ready && pageLayout ? (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${contentTranslation.x}px, ${contentTranslation.y}px)` }}
          >
            <div
              className="origin-top-left"
              style={{
                width: pageLayout.width,
                height: pageLayout.height,
                transform: `scale(${viewport.scale})`,
              }}
            >
              {pages.map((page, index) => (
                <canvas
                  key={index}
                  ref={(canvas) => {
                    if (canvas) pageCanvasesRef.current.set(index, canvas);
                    else pageCanvasesRef.current.delete(index);
                  }}
                  className="absolute left-1/2 block -translate-x-1/2 bg-white shadow-2xl"
                  style={{ top: pageLayout.offsets[index], width: page.width, height: page.height }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
