import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../../lib/utils";
import { SessionRuntimePicker } from "./SessionRuntimePicker";
import { ActionTooltip } from "../ui/ActionTooltip";

export function SessionMoveButton({
  sessionId,
  disabled,
  disabledReason,
  className,
}: {
  sessionId: string | null;
  disabled?: boolean;
  /** Tooltip shown when the button cannot be used. */
  disabledReason?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const unavailable = disabled || !sessionId;
  const label = !sessionId
    ? "Select a session to move"
    : disabledReason && unavailable
      ? disabledReason
      : "Move session";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ActionTooltip label={label}>
        <PopoverTrigger
          disabled={unavailable}
          className={cn(
            "app-region-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:cursor-default disabled:opacity-40",
            open ? "bg-surface-hover text-foreground" : undefined,
            className,
          )}
          aria-label="Move session"
        >
          <ArrowRightLeft size={13} />
        </PopoverTrigger>
      </ActionTooltip>
      {sessionId && (
        <PopoverContent align="end" className="w-80 bg-transparent p-0 shadow-none ring-0">
          <SessionRuntimePicker
            sessionId={sessionId}
            onClose={() => setOpen(false)}
            className="m-0 shadow-lg"
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
