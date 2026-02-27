import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type {
  Workspace,
  DragTarget,
  KanbanTicket,
  TicketStatus,
} from '../types';
import type { SessionInfo } from '../hooks/useThread';
import type { TerminalTab, TerminalEntry } from '../hooks/useStartupTerminals';
import { ThreadEventsContext } from './ThreadEventsContext';
import type { ThreadEventsContextValue } from './ThreadEventsContext';

export interface ThreadContextValue {
  // Core thread state (session-level, changes infrequently)
  selectedWorkspaceId: string | null;
  activeSessionId: string | null;
  sessions: SessionInfo[];
  threadWidth: number;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  expandedReadGroupIds: Record<string, boolean>;
  expandedTurnGroupIds: Record<string, boolean>;
  // Session-level callbacks
  openThreadPanel: (workspace: Workspace) => void;
  closeThreadPanel: () => void;
  toggleReadGroup: (groupId: string) => void;
  toggleTurnGroup: (groupId: string) => void;
  setHasWorktree: (value: boolean | null) => void;
  setThreadWidth: (width: number) => void;
  loadSessionEvents: (workspace: Workspace) => Promise<void>;
  deleteWorktree: (onDeleted?: (workspaceId: string) => void) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  clearSession: () => Promise<string | null>;
  // Ticket dependency support
  channelTickets: { workspaceId: string; title: string; status: string }[];
  setTicketDependencies: (workspaceId: string, depIds: string[], runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => void;
  removeTicketDependency: (workspaceId: string, dependsOnWorkspaceId: string) => void;
  updateQueuedRunConfig: (workspaceId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => void;
  // Derived state
  isClaudeRunning: boolean;
  workspaceStatus: TicketStatus;
  queuedRunConfig: { prompt: string; model: string; effort: string; planMode: boolean } | null;
  selectedTicket: KanbanTicket | null;
  // UI state
  isFullscreen: boolean;
  scriptsAvailable: boolean;
  hasSetupScript: boolean;
  hasRunScript: boolean;
  dragging: DragTarget;
  // UI callbacks
  onClose: () => void;
  onDeleteWorktree: () => void;
  onInitializeTerminals: () => void;
  onRerunScript: (tabName: string) => void;
  onStopScript: (tabName: string) => void;
  runScriptRunning: boolean;
  onStartDrag: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
  // Terminal state for thread tabs
  baseBranch: string;
  terminals: TerminalTab[];
  allTerminalEntries: TerminalEntry[];
  terminalsInitialized: boolean;
  activeTerminalTabId: string | null;
  terminalCwd: string;
  onSelectTerminalTab: (terminalId: string) => void;
  onCloseTerminalTab: (terminalId: string) => void;
  onCloseAllTerminals: () => void;
  onAddTerminal: () => void;
  onOpenSettings: () => void;
  prUrl: string | null;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export function ThreadProvider({
  value,
  eventsValue,
  children,
}: {
  value: ThreadContextValue;
  eventsValue: ThreadEventsContextValue;
  children: ReactNode;
}) {
  return (
    <ThreadContext.Provider value={value}>
      <ThreadEventsContext.Provider value={eventsValue}>
        {children}
      </ThreadEventsContext.Provider>
    </ThreadContext.Provider>
  );
}

export function useThreadContext() {
  const context = useContext(ThreadContext);
  if (!context) {
    throw new Error('useThreadContext must be used within ThreadProvider');
  }
  return context;
}
