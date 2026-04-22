import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../../lib/utils";
import { SessionRuntimePicker } from "./SessionRuntimePicker";

export function SessionMoveButton({
  sessionId,
  disabled,
  disabledReason,
  className,
}: {
  sessionId: string | null;
  disabled?: boolean;
  /** Tooltip shown when the button is disabled, in place of the default title. */
  disabledReason?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const unavailable = disabled || !sessionId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={unavailable}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
          open ? "bg-surface-elevated text-foreground" : undefined,
          className,
        )}
        title={!sessionId ? undefined : disabledReason && unavailable ? disabledReason : "Move session"}
      >
        <ArrowRightLeft size={14} />
      </PopoverTrigger>
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
