import { ExternalLink } from "lucide-react";

export function AppPreviewFrameControls({ url, status }: { url: string; status: string }) {
  return (
    <div
      className="absolute -left-px -top-7 z-10 flex h-7 items-center gap-1.5 bg-background pl-2.5 pr-5 text-[11px] font-medium capitalize text-foreground shadow-sm"
      style={{ clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 100%, 0 100%)" }}
    >
      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      {status}
      {status === "running" ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open preview in a new tab"
          title="Open preview in a new tab"
          className="ml-0.5 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink size={12} />
        </a>
      ) : null}
    </div>
  );
}
