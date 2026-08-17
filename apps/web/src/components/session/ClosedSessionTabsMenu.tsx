import { History } from "lucide-react";
import type { SessionEntity } from "@trace/client-core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ActionTooltip } from "../ui/ActionTooltip";

interface ClosedSessionTabsMenuProps {
  sessions: SessionEntity[];
  onRestoreSession: (sessionId: string) => void;
}

export function ClosedSessionTabsMenu({ sessions, onRestoreSession }: ClosedSessionTabsMenuProps) {
  if (sessions.length === 0) return null;

  return (
    <DropdownMenu>
      <ActionTooltip label="Closed tabs">
        <DropdownMenuTrigger
          className="app-region-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Closed tabs"
        >
          <History size={13} />
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent
        align="end"
        className="max-h-[min(20rem,var(--available-height))] w-64 max-w-80 border border-border shadow-[0_16px_48px_#0004] data-open:zoom-in-[0.98] data-open:duration-150 data-closed:zoom-out-[0.98] data-closed:duration-100"
      >
        {sessions.map((session) => (
          <DropdownMenuItem
            key={session.id}
            onClick={() => onRestoreSession(session.id)}
            className="h-8 cursor-pointer gap-2 rounded-sm px-2 text-foreground hover:bg-surface-hover focus:bg-surface-hover"
          >
            <History size={14} />
            <span className="min-w-0 flex-1 truncate opacity-60">{session.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
