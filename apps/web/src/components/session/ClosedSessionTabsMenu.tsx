import { useState } from "react";
import { History } from "lucide-react";
import type { SessionEntity } from "@trace/client-core";
import { ActionTooltip } from "../ui/ActionTooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

interface ClosedSessionTabsMenuProps {
  sessions: SessionEntity[];
  onRestoreSession: (sessionId: string) => void;
}

export function ClosedSessionTabsMenu({ sessions, onRestoreSession }: ClosedSessionTabsMenuProps) {
  const [open, setOpen] = useState(false);

  if (sessions.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ActionTooltip label="Closed tabs">
        <PopoverTrigger
          className="app-region-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-[border-color,box-shadow] duration-200 ease-out hover:border-surface-hover hover:bg-surface-hover hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring motion-reduce:transition-none"
          aria-label="Closed tabs"
        >
          <History size={13} />
        </PopoverTrigger>
      </ActionTooltip>
      <PopoverContent
        align="end"
        className="max-h-[min(20rem,var(--available-height))] w-64 max-w-80 gap-0 overflow-x-hidden overflow-y-auto border border-border bg-popover p-1 shadow-[0_16px_48px_#0004] data-open:zoom-in-[0.98] data-open:duration-150 data-closed:zoom-out-[0.98] data-closed:duration-100"
      >
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => {
              onRestoreSession(session.id);
              setOpen(false);
            }}
            className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm text-foreground outline-hidden select-none hover:bg-surface-hover focus:bg-surface-hover"
          >
            <History size={14} />
            <span className="min-w-0 truncate opacity-60">{session.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
