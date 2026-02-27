import { createContext, useContext } from 'react';
import type { ServerEvent, SessionRenderNode, SessionStatus } from '../types';

export interface ThreadEventsContextValue {
  sessionEvents: ServerEvent[];
  sessionNodes: SessionRenderNode[];
  sessionStatus: SessionStatus;
  hasMoreEvents: boolean;
  loadingOlderEvents: boolean;
  // Scroll state
  threadContentRef: React.RefObject<HTMLDivElement | null>;
  showJumpToLatest: boolean;
  scrollToLatest: () => void;
  onThreadScroll: () => void;
}

export const ThreadEventsContext = createContext<ThreadEventsContextValue | null>(null);

export function useThreadEventsContext() {
  const context = useContext(ThreadEventsContext);
  if (!context) {
    throw new Error('useThreadEventsContext must be used within ThreadProvider');
  }
  return context;
}
