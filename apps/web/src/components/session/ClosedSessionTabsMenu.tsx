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
      <DropdownMenuContent align="end">
        {sessions.map((session) => (
          <DropdownMenuItem key={session.id} onClick={() => onRestoreSession(session.id)}>
            <History size={14} />
            <span className="max-w-56 truncate opacity-60">{session.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
