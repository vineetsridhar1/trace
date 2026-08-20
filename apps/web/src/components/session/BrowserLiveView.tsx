import { useEffect, useState } from "react";
import { Eye, LoaderCircle } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";

const BROWSER_LIVE_FRAME_QUERY = gql`
  query BrowserLiveFrame($sessionId: ID!) {
    browserLiveFrame(sessionId: $sessionId) { imageBase64 capturedAt }
  }
`;

export function BrowserLiveView({ sessionId, active }: { sessionId: string; active: boolean }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setImage(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const result = await client
        .query(BROWSER_LIVE_FRAME_QUERY, { sessionId }, { requestPolicy: "network-only" })
        .toPromise();
      if (!cancelled && result.data?.browserLiveFrame?.imageBase64) {
        setImage(`data:image/png;base64,${result.data.browserLiveFrame.imageBase64}`);
      }
      if (!cancelled) timer = setTimeout(refresh, 1_000);
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, sessionId]);

  if (!active) return null;
  return (
    <aside className="absolute right-3 top-3 z-20 w-64 overflow-hidden rounded-lg border border-border bg-surface-deep shadow-xl">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs text-muted-foreground">
        <Eye className="size-3.5 text-accent" />
        <span className="font-medium text-foreground">Live browser</span>
        <span className="ml-auto">View only</span>
      </div>
      <div className="aspect-video bg-black">
        {image ? (
          <img src={image} alt="Live browser view" className="size-full object-contain" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
          </div>
        )}
      </div>
    </aside>
  );
}
