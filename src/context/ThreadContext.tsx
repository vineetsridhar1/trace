import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type {
  ChannelMessage,
  DragTarget,
  KanbanTicket,
  ServerEvent,
  ThreadRenderNode,
  ThreadStatus,
  TicketStatus,
} from '../types';
import type { ThreadInfo } from '../hooks/useThread';

export interface ThreadContextValue {
  // Core thread state
  selectedMessageId: string | null;
  activeThreadId: string | null;
  threads: ThreadInfo[];
  threadEvents: ServerEvent[];
  threadStatus: ThreadStatus;
  threadWidth: number;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  expandedReadGroupIds: Record<string, boolean>;
  openThreadPanel: (message: ChannelMessage) => void;
  closeThreadPanel: () => void;
  toggleReadGroup: (groupId: string) => void;
  setHasWorktree: (value: boolean | null) => void;
  setThreadWidth: (width: number) => void;
  loadThreadEvents: (message: ChannelMessage) => Promise<void>;
  deleteWorktree: (onDeleted?: (messageId: string) => void) => Promise<void>;
  switchThread: (threadId: string) => Promise<void>;
  clearThread: () => Promise<string | null>;
  // Scroll state
  threadContentRef: React.RefObject<HTMLDivElement | null>;
  showJumpToLatest: boolean;
  scrollToLatest: () => void;
  onThreadScroll: () => void;
  // Pagination state
  hasMoreEvents: boolean;
  loadingOlderEvents: boolean;
  // Token usage (server-computed aggregates)
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latestContextTokens: number;
  cliCostUsd: number | null;
  // Derived state
  threadNodes: ThreadRenderNode[];
  isClaudeRunning: boolean;
  messageStatus: TicketStatus;
  selectedTicket: KanbanTicket | null;
  // UI state
  isFullscreen: boolean;
  scriptsAvailable: boolean;
  dragging: DragTarget;
  // Callbacks
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
  children,
}: {
  value: ThreadContextValue;
  children: ReactNode;
}) {
  return (
    <ThreadContext.Provider value={value}>
      {children}
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
