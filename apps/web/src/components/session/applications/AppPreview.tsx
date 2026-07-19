import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Pencil, RotateCw } from "lucide-react";
import { client } from "@/lib/urql";
import { Button } from "@/components/ui/button";
import { TraceLoader } from "@/components/ui/trace-loader";
import { cn } from "@/lib/utils";
import { AppPreviewCanvas } from "./AppPreviewCanvas";
import { AppPreviewCanvasLoader } from "./AppPreviewCanvasLoader";
import { PreviewCredentialRenewal } from "./PreviewCredentialRenewal";
import { appPreviewReducer, initialAppPreviewState } from "./app-preview-state";
import { CREATE_PREVIEW_MUTATION } from "./session-applications-operations";
import { PdfPreviewControls } from "./PdfPreviewControls";
import { SavedPreviewSkeleton } from "./SavedPreviewSkeleton";
import { usePdfPreview } from "./usePdfPreview";
import { useDesignManualEdit } from "./useDesignManualEdit";

const INITIAL_FRAME_RETRY_MS = 4_000;
const MAX_FRAME_RETRY_MS = 30_000;

export function AppPreview({
  endpointId,
  status,
  fill = false,
  desktopViewport = false,
  title = "Live app preview",
  projectKind,
  sessionGroupId,
  designSessionGroupId,
}: {
  endpointId: string;
  status: string;
  fill?: boolean;
  desktopViewport?: boolean;
  title?: string;
  projectKind?: "design" | "pdf";
  sessionGroupId?: string;
  designSessionGroupId?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pdf = usePdfPreview({
    enabled: projectKind === "pdf",
    frameRef,
    sessionGroupId,
  });
  const [state, dispatch] = useReducer(appPreviewReducer, initialAppPreviewState);
  const [credentialExpiresAt, setCredentialExpiresAt] = useState<string | null>(null);
  const { attempts, error, frameLoaded, frameRevision, refreshing, requestRevision, url } = state;
  const manualEdit = useDesignManualEdit({
    sessionGroupId: designSessionGroupId ?? "",
    url,
  });

  const reload = useCallback(() => {
    dispatch({ type: "reload" });
  }, []);

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
      Math.min(MAX_FRAME_RETRY_MS, INITIAL_FRAME_RETRY_MS * 2 ** attempts),
    );
    return () => window.clearTimeout(timeout);
  }, [attempts, error, frameLoaded, frameRevision, url]);

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
          bare={projectKind === "pdf"}
          loadingKind={projectKind}
          pdfFormat={projectKind === "pdf" ? pdf.format : undefined}
          pdfContentHeight={projectKind === "pdf" ? pdf.contentHeight : undefined}
          onPdfFormatChange={projectKind === "pdf" ? pdf.updateFormat : undefined}
          onPdfDownload={projectKind === "pdf" ? () => void pdf.download() : undefined}
          pdfDownloadState={projectKind === "pdf" ? pdf.downloadState : undefined}
        />
        <PreviewCredentialRenewal endpointId={endpointId} expiresAt={credentialExpiresAt} />
      </>
    );
  }
  if (!url) {
    if (projectKind) return <SavedPreviewSkeleton kind={projectKind} />;

    return (
      <div className={cn("flex items-center justify-center", fill ? "h-full" : "aspect-video")}>
        <TraceLoader size={14} showLabel={false} />
      </div>
    );
  }
  return (
    <div className={cn("relative", fill && "h-full")}>
      {!frameLoaded && projectKind ? (
        <SavedPreviewSkeleton kind={projectKind} className="absolute inset-0 z-10" />
      ) : null}
      {projectKind === "pdf" ? (
        <PdfPreviewControls
          format={pdf.format}
          onFormatChange={pdf.updateFormat}
          onDownload={() => void pdf.download()}
          downloadState={pdf.downloadState}
        />
      ) : null}
      <PreviewCredentialRenewal endpointId={endpointId} expiresAt={credentialExpiresAt} />
      {designSessionGroupId ? (
        <Button
          size="sm"
          variant={manualEdit.enabled ? "default" : "outline"}
          onClick={manualEdit.toggle}
          title={manualEdit.enabled ? "Exit manual editing" : "Edit design manually"}
          aria-label={manualEdit.enabled ? "Exit manual editing" : "Edit design manually"}
          aria-pressed={manualEdit.enabled}
          className="absolute right-11 top-2 z-20 h-7 gap-1.5 px-2.5 opacity-90 hover:opacity-100"
        >
          <Pencil className="size-3" />
          {manualEdit.enabled ? (manualEdit.frameReady ? "Done" : "Connecting…") : "Edit"}
        </Button>
      ) : null}
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
        ref={designSessionGroupId ? manualEdit.frameRef : frameRef}
        key={frameRevision}
        src={url}
        title={title}
        onLoad={() => {
          dispatch({ type: "frame-loaded" });
          manualEdit.onFrameLoad();
        }}
        className={cn(
          "w-full bg-background",
          !frameLoaded && projectKind && "opacity-0",
          fill ? "h-full border-0" : "aspect-video rounded-md border border-border",
        )}
        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      />
    </div>
  );
}
