import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "@/lib/urql";
import { Button } from "@/components/ui/button";
import { TraceLoader } from "@/components/ui/trace-loader";
import { cn } from "@/lib/utils";
import { DesktopAppPreviewFrame } from "./DesktopAppPreviewFrame";

const CREATE_PREVIEW_MUTATION = gql`
  mutation CreateSessionEndpointPreview($endpointId: ID!) {
    createSessionEndpointPreview(endpointId: $endpointId) {
      url
    }
  }
`;

export function AppPreview({
  endpointId,
  fill = false,
  desktopViewport = false,
}: {
  endpointId: string;
  fill?: boolean;
  desktopViewport?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Re-minting the preview also refreshes the short-lived auth cookie, so the
  // reload button doubles as re-auth when the preview session expires.
  const [reloadNonce, setReloadNonce] = useState(0);

  const reload = useCallback(() => {
    setUrl(null);
    setError(null);
    setReloadNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void client
      .mutation(CREATE_PREVIEW_MUTATION, { endpointId })
      .toPromise()
      .then((result) => {
        if (!active) return;
        if (result.error) setError(result.error.message);
        else setUrl(result.data?.createSessionEndpointPreview?.url ?? null);
      });
    return () => {
      active = false;
    };
  }, [endpointId, reloadNonce]);

  if (error) {
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
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center", fill ? "h-full" : "aspect-video")}>
        <TraceLoader size={14} showLabel={false} />
      </div>
    );
  }
  if (desktopViewport) {
    return <DesktopAppPreviewFrame url={url} reloadNonce={reloadNonce} onReload={reload} />;
  }
  return (
    <div className={cn("relative", fill && "h-full")}>
      <Button
        size="icon"
        variant="outline"
        onClick={reload}
        title="Reload preview"
        className="absolute right-2 top-2 z-10 size-7 opacity-80 hover:opacity-100"
      >
        <RotateCw className="size-3" />
      </Button>
      <iframe
        key={reloadNonce}
        src={url}
        title="Live app preview"
        className={cn(
          "w-full bg-background",
          fill ? "h-full border-0" : "aspect-video rounded-md border border-border",
        )}
        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      />
    </div>
  );
}
