import { History } from "lucide-react";
import type { SessionEntity } from "@trace/client-core";
import { ActionTooltip } from "../ui/ActionTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";

interface ClosedSessionTabsMenuProps {
  sessions: SessionEntity[];
  onRestoreSession: (sessionId: string) => void;
}

export function ClosedSessionTabsMenu({ sessions, onRestoreSession }: ClosedSessionTabsMenuProps) {
  if (sessions.length === 0) return null;

  return (
    <Select
      value={null}
      onValueChange={(sessionId) => {
        if (sessionId) onRestoreSession(sessionId);
      }}
    >
      <ActionTooltip label="Closed tabs">
        <SelectTrigger
          size="sm"
          className="app-region-no-drag h-7 min-w-0 w-7 justify-center gap-0 rounded-md border-border/70 bg-background/40 px-0 text-muted-foreground hover:bg-surface-hover hover:text-foreground [&_[data-slot=select-icon]]:hidden"
          aria-label="Closed tabs"
        >
          <History size={13} />
        </SelectTrigger>
      </ActionTooltip>
      <SelectContent align="end" className="w-64">
        {sessions.map((session) => (
          <SelectItem key={session.id} value={session.id}>
            <History size={14} />
            <span className="min-w-0 truncate opacity-60">{session.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
