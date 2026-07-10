import { ExternalLink } from "lucide-react";
import { buttonVariants } from "../../ui/button";
import { cn } from "../../../lib/utils";

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
          className={cn(
            buttonVariants({ variant: "ghost", size: "xs" }),
            "ml-1 h-6 border-l border-border px-1.5 capitalize",
          )}
        >
          Open
          <ExternalLink size={12} />
        </a>
      ) : null}
    </div>
  );
}
