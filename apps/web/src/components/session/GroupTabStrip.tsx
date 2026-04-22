import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, FileCode, GitCompareArrows, MessageSquarePlus, Plus, TerminalSquare, X } from "lucide-react";
import type { SessionEntity } from "@trace/client-core";
import type { TerminalEntry } from "../../stores/terminal";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui";
import { ScrambleText } from "../ui/ScrambleText";
import { agentStatusColor, getDisplayAgentStatus, terminalStatusColor, terminalStatusLabel } from "./sessionStatus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export interface OpenFileTab {
  filePath: string;
  fileName: string;
  isDiff?: boolean;
  diffStatus?: string;
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
  onCloseSession?: (sessionId: string) => void;
  canCloseSessions?: boolean;
  onSelectTerminal: (sessionId: string | null, terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onRenameTerminal: (terminalId: string, name: string) => void;
  onSelectFile: (filePath: string) => void;
  onCloseFile: (filePath: string) => void;
  onNewChat: () => void;
  onOpenTerminal: () => void;
  canNewChat: boolean;
  canOpenTerminal: boolean;
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
  onCloseSession,
  canCloseSessions,
  onSelectTerminal,
  onCloseTerminal,
  onRenameTerminal,
  onSelectFile,
  onCloseFile,
  onNewChat,
  onOpenTerminal,
  canNewChat,
  canOpenTerminal,
}: GroupTabStripProps) {
  const sessionDoneBadges = useUIStore((s: { sessionDoneBadges: Record<string, boolean> }) => s.sessionDoneBadges);
  const sessionById = new Map(groupSessions.map((s) => [s.id, s]));
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingTerminalId, setEditingTerminalId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  // Cmd+T to open the new tab dropdown
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        setDropdownOpen((v: boolean) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Number key shortcuts when dropdown is open
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "1" && canNewChat) {
        e.preventDefault();
        setDropdownOpen(false);
        onNewChat();
      } else if (e.key === "2" && canOpenTerminal) {
        e.preventDefault();
        setDropdownOpen(false);
        onOpenTerminal();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dropdownOpen, canNewChat, canOpenTerminal, onNewChat, onOpenTerminal]);

  return (
    <TooltipProvider delay={300}>
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
            const hasDoneBadge = !!sessionDoneBadges[session.id];
            return (
              <div
                key={session.id}
                ref={(el: HTMLElement | null) => setTabRef(session.id, el)}
                className={cn(
                  tabBase,
                  "max-w-[260px] gap-0 p-0",
                  isActive ? tabActive : tabInactive,
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className="inline-flex min-w-0 items-center gap-2 px-3 py-2"
                >
                  <span className={cn("relative shrink-0 flex h-2.5 w-2.5 items-center justify-center", color)}>
                    <Circle size={6} className="fill-current" />
                    {hasDoneBadge && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                    )}
                  </span>
                  <span className={cn("truncate", hasDoneBadge ? "font-semibold" : undefined)}>
                    <ScrambleText text={session.name} />
                  </span>
                </button>
                {canCloseSessions && onCloseSession && (
                  <button
                    type="button"
                    onClick={() => onCloseSession(session.id)}
                    className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-surface-hover hover:opacity-100"
                    title="Close session tab"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {terminals.map((terminal, index) => {
            const session = terminal.sessionId ? sessionById.get(terminal.sessionId) : undefined;
            const defaultLabel = session ? `Terminal ${index + 1} · ${session.name}` : `Terminal ${index + 1}`;
            const label = terminal.customName || defaultLabel;
            const isActive = activeTerminalId === terminal.id;
            const isEditing = editingTerminalId === terminal.id;
            const statusColor = terminalStatusColor[terminal.status] ?? "text-muted-foreground";
            const statusLabel = terminalStatusLabel[terminal.status] ?? terminal.status;
            return (
              <div
                key={terminal.id}
                ref={(el: HTMLElement | null) => setTabRef(terminal.id, el)}
                className={cn(
                  tabBase,
                  "max-w-[260px] gap-0 p-0",
                  isActive ? tabActive : tabInactive,
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectTerminal(session?.id ?? null, terminal.id)}
                  onDoubleClick={() => {
                    setEditingTerminalId(terminal.id);
                    setEditValue(terminal.customName || "");
                  }}
                  className="inline-flex min-w-0 items-center gap-2 px-3 py-2"
                >
                  <Tooltip>
                    <TooltipTrigger
                      className={cn("shrink-0 flex h-2.5 w-2.5 items-center justify-center", statusColor)}
                      render={<span />}
                    >
                      <Circle size={6} className="fill-current" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {statusLabel}
                    </TooltipContent>
                  </Tooltip>
                  {isEditing ? (
                    <input
                      autoFocus
                      className="min-w-24 max-w-[180px] bg-transparent text-xs outline-none border-b border-foreground/30"
                      value={editValue}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") {
                          onRenameTerminal(terminal.id, editValue);
                          setEditingTerminalId(null);
                        } else if (e.key === "Escape") {
                          setEditingTerminalId(null);
                        }
                      }}
                      onBlur={() => {
                        if (editingTerminalId === terminal.id) {
                          onRenameTerminal(terminal.id, editValue);
                          setEditingTerminalId(null);
                        }
                      }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate">{label}</span>
                  )}
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
                ref={(el: HTMLElement | null) => setTabRef(file.filePath, el)}
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
                  {file.isDiff ? (
                    <GitCompareArrows size={12} className="shrink-0" />
                  ) : (
                    <FileCode size={12} className="shrink-0" />
                  )}
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

          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger
              className="inline-flex shrink-0 items-center justify-center px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
              title="New tab (⌘T)"
            >
              <Plus size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                disabled={!canNewChat}
                onClick={onNewChat}
              >
                <MessageSquarePlus size={14} />
                Agent
                <DropdownMenuShortcut>1</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canOpenTerminal}
                onClick={onOpenTerminal}
              >
                <TerminalSquare size={14} />
                Terminal
                <DropdownMenuShortcut>2</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
