import { useCallback, useEffect, useReducer } from "react";
import { RotateCw } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "@/lib/urql";
import { Button } from "@/components/ui/button";
import { TraceLoader } from "@/components/ui/trace-loader";
import { cn } from "@/lib/utils";
import { AppPreviewCanvas } from "./AppPreviewCanvas";
import { AppPreviewCanvasLoader } from "./AppPreviewCanvasLoader";
import { appPreviewReducer, initialAppPreviewState } from "./app-preview-state";

const CREATE_PREVIEW_MUTATION = gql`
  mutation CreateSessionEndpointPreview($endpointId: ID!) {
    createSessionEndpointPreview(endpointId: $endpointId) {
      url
    }
  }
`;

const INITIAL_FRAME_RETRY_MS = 4_000;

export function AppPreview({
  endpointId,
  status,
  fill = false,
  desktopViewport = false,
}: {
  endpointId: string;
  status: string;
  fill?: boolean;
  desktopViewport?: boolean;
}) {
  const [state, dispatch] = useReducer(appPreviewReducer, initialAppPreviewState);
  const { error, frameLoaded, frameRevision, refreshing, requestRevision, url } = state;

  const reload = useCallback(() => {
    dispatch({ type: "reload" });
  }, []);

  useEffect(() => {
    let active = true;
    void client
      .mutation(CREATE_PREVIEW_MUTATION, { endpointId })
      .toPromise()
      .then((result) => {
        if (!active) return;
        const nextUrl = result.data?.createSessionEndpointPreview?.url;
        if (result.error || !nextUrl) {
          dispatch({
            type: "request-failed",
            error: result.error?.message ?? "Failed to load the app preview",
          });
          return;
        }
        dispatch({ type: "request-succeeded", url: nextUrl });
      });
    return () => {
      active = false;
    };
  }, [endpointId, requestRevision]);

  useEffect(() => {
    if (!url || frameLoaded) return;
    const timeout = window.setTimeout(reload, INITIAL_FRAME_RETRY_MS);
    return () => window.clearTimeout(timeout);
  }, [frameLoaded, frameRevision, reload, url]);

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
        <p className="px-2 text-center text-xs text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={reload}>
          <RotateCw className="mr-1 size-3" />
          Retry
        </Button>
      </div>
    );
  }
  if (desktopViewport) {
    return (
      <AppPreviewCanvas
        url={url}
        frameRevision={frameRevision}
        loaded={frameLoaded}
        refreshing={refreshing}
        status={status}
        onLoad={() => dispatch({ type: "frame-loaded" })}
        onReload={reload}
      />
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
      <Button
        size="icon"
        variant="outline"
        onClick={reload}
        disabled={refreshing}
        title="Reload preview"
        className="absolute right-2 top-2 z-10 size-7 opacity-80 hover:opacity-100"
      >
        <RotateCw className={cn("size-3", refreshing && "animate-spin")} />
      </Button>
      <iframe
        key={frameRevision}
        src={url}
        title="Live app preview"
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
