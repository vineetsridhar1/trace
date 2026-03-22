import { Circle, TerminalSquare, X } from "lucide-react";
import type { SessionEntity } from "../../stores/entity";
import type { TerminalEntry } from "../../stores/terminal";
import { cn } from "../../lib/utils";
import { getDisplayStatus, statusColor } from "./sessionStatus";

interface GroupTabStripProps {
  sessionTabs: SessionEntity[];
  terminals: TerminalEntry[];
  groupSessions: SessionEntity[];
  selectedSessionId: string | null;
  activeTerminalId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSelectTerminal: (sessionId: string | null, terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
}

export function GroupTabStrip({
  sessionTabs,
  terminals,
  groupSessions,
  selectedSessionId,
  activeTerminalId,
  onSelectSession,
  onSelectTerminal,
  onCloseTerminal,
}: GroupTabStripProps) {
  return (
    <div className="shrink-0 border-b border-border bg-surface px-2 pt-1 pb-0">
      <div className="native-scrollbar overflow-x-auto">
        <div className="flex min-w-max items-center gap-1">
          {sessionTabs.map((session) => {
            const displayStatus = getDisplayStatus(session.status, null);
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  "inline-flex max-w-[220px] shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                  !activeTerminalId && selectedSessionId === session.id
                    ? "bg-surface-elevated text-foreground"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                <Circle size={6} className={cn("fill-current", statusColor[displayStatus])} />
                <span className="truncate">{session.name}</span>
              </button>
            );
          })}

          {terminals.map((terminal, index) => {
            const session = groupSessions.find((candidate) => candidate.id === terminal.sessionId);
            const label = session ? `Terminal ${index + 1} · ${session.name}` : `Terminal ${index + 1}`;
            return (
              <div
                key={terminal.id}
                className={cn(
                  "inline-flex max-w-[260px] shrink-0 items-center rounded-md text-xs transition-colors",
                  activeTerminalId === terminal.id
                    ? "bg-surface-elevated text-foreground"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectTerminal(session?.id ?? null, terminal.id)}
                  className="inline-flex min-w-0 items-center gap-2 px-3 py-1.5"
                >
                  <TerminalSquare size={12} />
                  <span className="truncate">{label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTerminal(terminal.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:opacity-100"
                  title="Close terminal tab"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
