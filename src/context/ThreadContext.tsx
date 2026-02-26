import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type {
  ChannelMessage,
  DragTarget,
  KanbanTicket,
  TicketStatus,
} from '../types';
import type { ThreadInfo } from '../hooks/useThread';
import { ThreadEventsContext } from './ThreadEventsContext';
import type { ThreadEventsContextValue } from './ThreadEventsContext';

export interface ThreadContextValue {
  // Core thread state (session-level, changes infrequently)
  selectedMessageId: string | null;
  activeThreadId: string | null;
  threads: ThreadInfo[];
  threadWidth: number;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  expandedReadGroupIds: Record<string, boolean>;
  // Session-level callbacks
  openThreadPanel: (message: ChannelMessage) => void;
  closeThreadPanel: () => void;
  toggleReadGroup: (groupId: string) => void;
  setHasWorktree: (value: boolean | null) => void;
  setThreadWidth: (width: number) => void;
  loadThreadEvents: (message: ChannelMessage) => Promise<void>;
  deleteWorktree: (onDeleted?: (messageId: string) => void) => Promise<void>;
  switchThread: (threadId: string) => Promise<void>;
  clearThread: () => Promise<string | null>;
  // Ticket dependency support
  channelTickets: { messageId: string; title: string; status: string }[];
  setTicketDependencies: (messageId: string, depIds: string[], runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => void;
  // Derived state
  isClaudeRunning: boolean;
  messageStatus: TicketStatus;
  selectedTicket: KanbanTicket | null;
  // UI state
  isFullscreen: boolean;
  scriptsAvailable: boolean;
  dragging: DragTarget;
  // UI callbacks
  onClose: () => void;
  onDeleteWorktree: () => void;
  onRunScripts: () => void;
  onStartDrag: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
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
