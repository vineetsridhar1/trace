import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { client } from "@/lib/urql";
import { Button } from "@/components/ui/button";
import { TraceLoader } from "@/components/ui/trace-loader";
import { cn } from "@/lib/utils";
import { AppPreviewCanvas } from "./AppPreviewCanvas";
import { AppPreviewCanvasLoader } from "./AppPreviewCanvasLoader";
import { PreviewCredentialRenewal } from "./PreviewCredentialRenewal";
import { appPreviewReducer, initialAppPreviewState } from "./app-preview-state";
import { CREATE_PREVIEW_MUTATION } from "./session-applications-operations";
import { PdfPreviewControls, type PdfPageFormat } from "./PdfPreviewControls";

const INITIAL_FRAME_RETRY_MS = 4_000;

export function AppPreview({
  endpointId,
  status,
  fill = false,
  desktopViewport = false,
  title = "Live app preview",
  projectKind,
}: {
  endpointId: string;
  status: string;
  fill?: boolean;
  desktopViewport?: boolean;
  title?: string;
  projectKind?: "pdf";
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [pdfFormat, setPdfFormat] = useState<PdfPageFormat>({
    width: 210,
    height: 297,
    unit: "mm",
  });
  const [state, dispatch] = useReducer(appPreviewReducer, initialAppPreviewState);
  const [credentialExpiresAt, setCredentialExpiresAt] = useState<string | null>(null);
  const { error, frameLoaded, frameRevision, refreshing, requestRevision, url } = state;

  const reload = useCallback(() => {
    dispatch({ type: "reload" });
  }, []);

  const sendPdfMessage = useCallback((type: "format" | "print", format?: PdfPageFormat) => {
    frameRef.current?.contentWindow?.postMessage(
      { source: "trace", type: `pdf:${type}`, format },
      "*",
    );
  }, []);

  const updatePdfFormat = useCallback(
    (format: PdfPageFormat) => {
      setPdfFormat(format);
      sendPdfMessage("format", format);
    },
    [sendPdfMessage],
  );

  useEffect(() => {
    let active = true;
    setCredentialExpiresAt(null);
    void client
      .mutation(CREATE_PREVIEW_MUTATION, { endpointId })
      .toPromise()
      .then((result) => {
        if (!active) return;
        const nextUrl = result.data?.createSessionEndpointPreview?.url;
        const expiresAt = result.data?.createSessionEndpointPreview?.expiresAt;
        if (result.error || !nextUrl || !expiresAt) {
          dispatch({
            type: "request-failed",
            error: result.error?.message ?? "Failed to load the app preview",
          });
          return;
        }
        setCredentialExpiresAt(expiresAt);
        dispatch({ type: "request-succeeded", url: nextUrl });
      });
    return () => {
      active = false;
    };
  }, [endpointId, requestRevision]);

  useEffect(() => {
    if (!url || frameLoaded || error) return;
    const timeout = window.setTimeout(
      () => dispatch({ type: "frame-retry" }),
      INITIAL_FRAME_RETRY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [error, frameLoaded, frameRevision, url]);

  if (error) {
    if (desktopViewport) {
      return <AppPreviewCanvasLoader error={error} onRetry={reload} />;
    }
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2",
          fill ? "h-full" : "aspect-video",
        )}
      >
        <p aria-live="polite" className="px-2 text-center text-xs text-destructive">
          {error}
        </p>
        <Button size="sm" variant="outline" onClick={reload}>
          <RotateCw className="mr-1 size-3" />
          Retry
        </Button>
      </div>
    );
  }
  if (desktopViewport) {
    return (
      <>
        {projectKind === "pdf" ? (
          <PdfPreviewControls
            format={pdfFormat}
            onFormatChange={updatePdfFormat}
            onDownload={() => sendPdfMessage("print")}
          />
        ) : null}
        <AppPreviewCanvas
          url={url}
          title={title}
          frameRevision={frameRevision}
          loaded={frameLoaded}
          refreshing={refreshing}
          status={status}
          onLoad={() => dispatch({ type: "frame-loaded" })}
          onReload={reload}
          iframeRef={frameRef}
        />
        <PreviewCredentialRenewal endpointId={endpointId} expiresAt={credentialExpiresAt} />
      </>
    );
  }
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center", fill ? "h-full" : "aspect-video")}>
        <TraceLoader size={14} showLabel={false} />
      </div>
    );
  }
  return (
    <div className={cn("relative", fill && "h-full")}>
      {projectKind === "pdf" ? (
        <PdfPreviewControls
          format={pdfFormat}
          onFormatChange={updatePdfFormat}
          onDownload={() => sendPdfMessage("print")}
        />
      ) : null}
      <PreviewCredentialRenewal endpointId={endpointId} expiresAt={credentialExpiresAt} />
      <Button
        size="icon"
        variant="outline"
        onClick={reload}
        disabled={refreshing}
        title="Reload preview"
        aria-label="Reload preview"
        className="absolute right-2 top-2 z-10 size-7 opacity-80 hover:opacity-100"
      >
        <RotateCw className={cn("size-3", refreshing && "animate-spin")} />
      </Button>
      <iframe
        ref={frameRef}
        key={frameRevision}
        src={url}
        title={title}
        onLoad={() => dispatch({ type: "frame-loaded" })}
        className={cn(
          "w-full bg-background",
          fill ? "h-full border-0" : "aspect-video rounded-md border border-border",
        )}
        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      />
    </div>
  );
}
