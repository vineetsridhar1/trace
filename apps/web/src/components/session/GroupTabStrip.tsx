import { useCallback, useEffect, useRef } from "react";
import { Circle, FileCode, TerminalSquare, X } from "lucide-react";
import type { SessionEntity } from "../../stores/entity";
import type { TerminalEntry } from "../../stores/terminal";
import { cn } from "../../lib/utils";
import { agentStatusColor, getDisplayAgentStatus } from "./sessionStatus";

export interface OpenFileTab {
  filePath: string;
  fileName: string;
}

interface GroupTabStripProps {
  sessionTabs: SessionEntity[];
  terminals: TerminalEntry[];
  groupSessions: SessionEntity[];
  selectedSessionId: string | null;
  activeTerminalId: string | null;
  openFiles: OpenFileTab[];
  activeFilePath: string | null;
  onSelectSession: (sessionId: string) => void;
  onSelectTerminal: (sessionId: string | null, terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onSelectFile: (filePath: string) => void;
  onCloseFile: (filePath: string) => void;
}

const tabBase =
  "inline-flex max-w-[220px] shrink-0 items-center gap-2 border-r border-border/40 px-3 py-2 text-xs transition-colors";

const tabActive = "bg-surface-elevated text-foreground";

const tabInactive =
  "bg-surface-deep text-muted-foreground hover:text-foreground";

export function GroupTabStrip({
  sessionTabs,
  terminals,
  groupSessions,
  selectedSessionId,
  activeTerminalId,
  openFiles,
  activeFilePath,
  onSelectSession,
  onSelectTerminal,
  onCloseTerminal,
  onSelectFile,
  onCloseFile,
}: GroupTabStripProps) {
  const sessionById = new Map(groupSessions.map((s) => [s.id, s]));
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map());

  const setTabRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) tabRefs.current.set(key, el);
    else tabRefs.current.delete(key);
  }, []);

  // Scroll the active tab into view when selection changes
  const activeKey = activeFilePath ?? activeTerminalId ?? selectedSessionId;
  useEffect(() => {
    if (!activeKey) return;
    const el = tabRefs.current.get(activeKey);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeKey]);

  return (
    <div className="shrink-0 bg-surface-deep">
      <div className="native-scrollbar overflow-x-auto">
        <div className="flex min-w-max">
          {sessionTabs.map((session) => {
            const displayAgentStatus = getDisplayAgentStatus(
              session.agentStatus,
              session.sessionStatus,
            );
            const color = agentStatusColor[displayAgentStatus] ?? "text-muted-foreground";
            const isActive = !activeTerminalId && !activeFilePath && selectedSessionId === session.id;
            return (
              <button
                key={session.id}
                ref={(el) => setTabRef(session.id, el)}
                onClick={() => onSelectSession(session.id)}
                className={cn(tabBase, isActive ? tabActive : tabInactive)}
              >
                <Circle size={6} className={cn("shrink-0 fill-current", color)} />
                <span className="truncate">{session.name}</span>
              </button>
            );
          })}

          {terminals.map((terminal, index) => {
            const session = sessionById.get(terminal.sessionId);
            const label = session ? `Terminal ${index + 1} · ${session.name}` : `Terminal ${index + 1}`;
            const isActive = activeTerminalId === terminal.id;
            return (
              <div
                key={terminal.id}
                ref={(el) => setTabRef(terminal.id, el)}
                className={cn(
                  tabBase,
                  "max-w-[260px] gap-0 p-0",
                  isActive ? tabActive : tabInactive,
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectTerminal(session?.id ?? null, terminal.id)}
                  className="inline-flex min-w-0 items-center gap-2 px-3 py-2"
                >
                  <TerminalSquare size={12} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTerminal(terminal.id)}
                  className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-surface-hover hover:opacity-100"
                  title="Close terminal tab"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {openFiles.map((file) => {
            const isActive = activeFilePath === file.filePath;
            return (
              <div
                key={file.filePath}
                ref={(el) => setTabRef(file.filePath, el)}
                className={cn(
                  tabBase,
                  "max-w-[260px] gap-0 p-0",
                  isActive ? tabActive : tabInactive,
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectFile(file.filePath)}
                  className="inline-flex min-w-0 items-center gap-2 px-3 py-2"
                >
                  <FileCode size={12} className="shrink-0" />
                  <span className="truncate">{file.fileName}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCloseFile(file.filePath)}
                  className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-surface-hover hover:opacity-100"
                  title="Close file tab"
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
