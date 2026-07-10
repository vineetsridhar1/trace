import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "../../ui/button";
import { TraceLoader } from "../../ui/trace-loader";

const DESKTOP_VIEWPORT_WIDTH = 1440;

type FrameSize = {
  width: number;
  height: number;
};

export function DesktopAppPreviewFrame({
  url,
  reloadNonce,
  onReload,
}: {
  url: string;
  reloadNonce: number;
  onReload: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<FrameSize>({ width: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateSize = () => {
      const next = { width: frame.clientWidth, height: frame.clientHeight };
      setFrameSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const scale = frameSize.width > 0 ? frameSize.width / DESKTOP_VIEWPORT_WIDTH : 1;
  const viewportHeight = frameSize.height > 0 ? frameSize.height / scale : 0;
  const ready = frameSize.width > 0 && viewportHeight > 0;

  return (
    <div className="h-full px-4">
      <div
        ref={frameRef}
        className="relative h-full overflow-hidden rounded-md border border-border bg-background"
      >
        <Button
          size="icon"
          variant="outline"
          onClick={onReload}
          title="Reload preview"
          className="absolute right-2 top-2 z-10 size-7 opacity-80 hover:opacity-100"
        >
          <RotateCw className="size-3" />
        </Button>
        {ready ? (
          <iframe
            key={reloadNonce}
            src={url}
            title="Live app preview"
            className="absolute left-0 top-0 border-0 bg-background"
            style={{
              width: DESKTOP_VIEWPORT_WIDTH,
              height: viewportHeight,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TraceLoader size={14} showLabel={false} />
          </div>
        )}
      </div>
    </div>
  );
}
