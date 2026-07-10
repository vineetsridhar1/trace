import { ExternalLink } from "lucide-react";
import { buttonVariants } from "../../ui/button";
import { cn } from "../../../lib/utils";

export function AppPreviewFrameControls({ url, status }: { url: string; status: string }) {
  return (
    <>
      <div
        className="absolute -left-px -top-7 z-10 flex h-7 items-center gap-1.5 bg-background pl-2.5 pr-6 text-[11px] font-medium capitalize text-foreground shadow-sm"
        style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
      >
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {status}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open preview in a new tab"
        title="Open preview in a new tab"
        className={cn(
          buttonVariants({ variant: "outline", size: "xs" }),
          "absolute -right-px -top-7 z-10 h-7 rounded-b-none border-b-0 bg-background px-2 shadow-sm",
        )}
      >
        Open
        <ExternalLink size={12} />
      </a>
    </>
  );
}
