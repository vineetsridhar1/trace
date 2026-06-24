import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Activity,
  FilePlus2,
  FileCode,
  GitCompareArrows,
  Globe,
  MessageSquarePlus,
  Plus,
  TerminalSquare,
  X,
} from "lucide-react";
import type { SessionEntity } from "@trace/client-core";
import type { TerminalEntry } from "../../stores/terminal";
import type { BrowserTabEntry } from "../../stores/session-browser";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui";
import { ScrambleText } from "../ui/ScrambleText";
import {
  agentStatusColor,
  getDisplayAgentStatus,
  terminalStatusColor,
  terminalStatusLabel,
} from "./sessionStatus";
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
  lineNumber?: number;
  isDiff?: boolean;
  diffStatus?: string;
  isDraftAttachment?: boolean;
  attachmentSessionId?: string;
  attachmentId?: string;
  isUploadedAttachment?: boolean;
  attachmentKey?: string;
}

interface GroupTabStripProps {
  sessionTabs: SessionEntity[];
  terminals: TerminalEntry[];
  groupSessions: SessionEntity[];
  selectedSessionId: string | null;
  activeTerminalId: string | null;
  openFiles: OpenFileTab[];
  activeFilePath: string | null;
  browsers: BrowserTabEntry[];
  activeBrowserId: string | null;
  trafficTabOpen: boolean;
  trafficTabActive: boolean;
  onSelectSession: (sessionId: string) => void;
  onCloseSession?: (sessionId: string) => void;
  canCloseSessions?: boolean;
  onSelectTerminal: (sessionId: string | null, terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onRenameTerminal: (terminalId: string, name: string) => void;
  onSelectFile: (filePath: string) => void;
  onCloseFile: (filePath: string) => void;
  onSelectBrowser: (browserId: string) => void;
  onCloseBrowser: (browserId: string) => void;
  onSelectTraffic: () => void;
  onCloseTraffic: () => void;
  onNewChat: () => void;
  onOpenTerminal: () => void;
  onOpenFilePalette: () => void;
  onOpenBrowser: () => void;
  canNewChat: boolean;
  canOpenTerminal: boolean;
}

const tabBase =
  "inline-flex max-w-[220px] shrink-0 items-center gap-2 border-r border-b-2 border-border/40 px-3 py-2 text-xs transition-colors";

const tabActive = "border-b-accent bg-surface-mid text-foreground";

const tabInactive = "border-b-transparent bg-surface-mid text-muted-foreground hover:text-foreground";

export function GroupTabStrip({
  sessionTabs,
  terminals,
  groupSessions,
  selectedSessionId,
  activeTerminalId,
  openFiles,
  activeFilePath,
  browsers,
  activeBrowserId,
  trafficTabOpen,
  trafficTabActive,
  onSelectSession,
  onCloseSession,
  canCloseSessions,
  onSelectTerminal,
  onCloseTerminal,
  onRenameTerminal,
  onSelectFile,
  onCloseFile,
  onSelectBrowser,
  onCloseBrowser,
  onSelectTraffic,
  onCloseTraffic,
  onNewChat,
  onOpenTerminal,
  onOpenFilePalette,
  onOpenBrowser,
  canNewChat,
  canOpenTerminal,
}: GroupTabStripProps) {
  const sessionDoneBadges = useUIStore(
    (s: { sessionDoneBadges: Record<string, boolean> }) => s.sessionDoneBadges,
  );
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
  const activeKey = activeBrowserId
    ? `browser:${activeBrowserId}`
    : (activeFilePath ?? activeTerminalId ?? (trafficTabActive ? "traffic" : selectedSessionId));
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
      } else if (e.key === "3") {
        e.preventDefault();
        setDropdownOpen(false);
        onOpenFilePalette();
      } else if (e.key === "4") {
        e.preventDefault();
        setDropdownOpen(false);
        onOpenBrowser();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    dropdownOpen,
    canNewChat,
    canOpenTerminal,
    onNewChat,
    onOpenTerminal,
    onOpenFilePalette,
    onOpenBrowser,
  ]);

  return (
    <TooltipProvider delay={300}>
      <div className="app-region-drag shrink-0 border-b border-border bg-surface-mid">
        <div className="native-scrollbar overflow-x-auto">
          <div className="flex min-w-max">
            {sessionTabs.map((session) => {
              const displayAgentStatus = getDisplayAgentStatus(
                session.agentStatus,
                session.sessionStatus,
                null,
                null,
                session,
              );
              const color = agentStatusColor[displayAgentStatus] ?? "text-muted-foreground";
              const isActive =
                !activeTerminalId &&
                !activeFilePath &&
                !activeBrowserId &&
                !trafficTabActive &&
                selectedSessionId === session.id;
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
                    <span
                      className={cn(
                        "relative shrink-0 flex h-2.5 w-2.5 items-center justify-center",
                        color,
                      )}
                    >
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
              const session = sessionById.get(terminal.sessionId);
              const defaultLabel = session
                ? `Terminal ${index + 1} · ${session.name}`
                : `Terminal ${index + 1}`;
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
                        className={cn(
                          "shrink-0 flex h-2.5 w-2.5 items-center justify-center",
                          statusColor,
                        )}
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
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setEditValue(e.target.value)
                        }
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

            {trafficTabOpen && (
              <div
                ref={(el: HTMLElement | null) => setTabRef("traffic", el)}
                className={cn(
                  tabBase,
                  "max-w-[260px] gap-0 p-0",
                  trafficTabActive ? tabActive : tabInactive,
                )}
              >
                <button
                  type="button"
                  onClick={onSelectTraffic}
                  className="inline-flex min-w-0 items-center gap-2 px-3 py-2"
                >
                  <Activity size={12} className="shrink-0" />
                  <span className="truncate">Traffic</span>
                </button>
                <button
                  type="button"
                  onClick={onCloseTraffic}
                  className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-surface-hover hover:opacity-100"
                  title="Close traffic tab"
                >
                  <X size={12} />
                </button>
              </div>
            )}

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

            {browsers.map((browser) => {
              const isActive = activeBrowserId === browser.id;
              return (
                <div
                  key={browser.id}
                  ref={(el: HTMLElement | null) => setTabRef(`browser:${browser.id}`, el)}
                  className={cn(
                    tabBase,
                    "max-w-[260px] gap-0 p-0",
                    isActive ? tabActive : tabInactive,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectBrowser(browser.id)}
                    className="inline-flex min-w-0 items-center gap-2 px-3 py-2"
                  >
                    <Globe size={12} className="shrink-0" />
                    <span className="truncate">{browser.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseBrowser(browser.id)}
                    className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-surface-hover hover:opacity-100"
                    title="Close browser tab"
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
                <DropdownMenuItem disabled={!canNewChat} onClick={onNewChat}>
                  <MessageSquarePlus size={14} />
                  Agent
                  <DropdownMenuShortcut>1</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canOpenTerminal} onClick={onOpenTerminal}>
                  <TerminalSquare size={14} />
                  Terminal
                  <DropdownMenuShortcut>2</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenFilePalette}>
                  <FilePlus2 size={14} />
                  File
                  <DropdownMenuShortcut>3</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenBrowser}>
                  <Globe size={14} />
                  Browser
                  <DropdownMenuShortcut>4</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
