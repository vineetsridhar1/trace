import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { cn } from "../../../lib/utils";

export function DeferredDesignPreview({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const [active, setActive] = useState(false);

  return (
    <div
      className={cn("relative size-full [contain:paint]", className)}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div
        className={cn(
          "flex size-full items-center justify-center text-muted-foreground transition-opacity",
          active && "opacity-0",
        )}
        aria-hidden={active}
      >
        <LayoutTemplate className="size-6" />
      </div>
      {active ? (
        <iframe
          src={url}
          title={title}
          loading="lazy"
          tabIndex={-1}
          sandbox="allow-forms allow-modals allow-popups allow-scripts"
          className="pointer-events-none absolute inset-0 size-full border-0 bg-background"
        />
      ) : null}
    </div>
  );
}
