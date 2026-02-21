import { useCallback, useRef, useState } from 'react';
import type { ChannelMessage, ServerEvent, ThreadStatus, MessageThread } from '../types';
import { SERVER_URL } from '../types';
import { clamp } from '../utils';

export function useThread() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChannelMessage | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadEvents, setThreadEvents] = useState<ServerEvent[]>([]);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus>('idle');
  const [threadWidth, setThreadWidth] = useState(0);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [expandedReadGroupIds, setExpandedReadGroupIds] = useState<Record<string, boolean>>({});

  const selectedMessageRef = useRef<ChannelMessage | null>(null);
  const selectedMessageIdRef = useRef<string | null>(null);
  const lastReportedThreadEventIdByMessageRef = useRef<Map<string, string>>(new Map());

  selectedMessageRef.current = selectedMessage;
  selectedMessageIdRef.current = selectedMessageId;

  const threadOpen = threadWidth > 0;

  const reportClaudeActivity = useCallback(async (messageId: string, eventType: string) => {
    if (!window.traceAPI || typeof window.traceAPI.reportClaudeActivity !== 'function') return;
    try {
      await window.traceAPI.reportClaudeActivity(messageId, eventType);
    } catch {
      // best-effort
    }
  }, []);

  const resetThreadViewState = useCallback(() => {
    setShowJumpToLatest(false);
    setExpandedReadGroupIds({});
  }, []);

  const closeThreadPanel = useCallback(() => {
    setSelectedMessageId(null);
    setSelectedMessage(null);
    setActiveThreadId(null);
    setThreadEvents([]);
    setThreadStatus('idle');
    setThreadWidth(0);
    resetThreadViewState();
  }, [resetThreadViewState]);

  const loadThreadEvents = useCallback(
    async (message: ChannelMessage) => {
      try {
        setThreadStatus('loading');

        const threadsRes = await fetch(
          `${SERVER_URL}/channels/${message.channelId}/messages/${message.id}/threads`,
        );
        if (!threadsRes.ok) {
          setThreadStatus('error');
          return;
        }

        const { threads } = (await threadsRes.json()) as { threads: MessageThread[] };
        if (threads.length === 0) {
          setActiveThreadId(null);
          setThreadEvents([]);
          setThreadStatus('empty');
          return;
        }

        const thread = threads[0];
        setActiveThreadId(thread.id);

        const eventsRes = await fetch(
          `${SERVER_URL}/channels/${message.channelId}/messages/${message.id}/threads/${thread.id}/events?limit=200`,
        );
        if (!eventsRes.ok) {
          setThreadStatus('error');
          return;
        }

        const { events } = (await eventsRes.json()) as { events: ServerEvent[] };
        setThreadEvents(events);
        setThreadStatus(events.length === 0 ? 'empty' : 'ready');

        const latestEvent = events[events.length - 1];
        if (latestEvent) {
          const lastReportedId = lastReportedThreadEventIdByMessageRef.current.get(message.id);
          if (lastReportedId !== latestEvent.id) {
            lastReportedThreadEventIdByMessageRef.current.set(message.id, latestEvent.id);
            void reportClaudeActivity(message.id, latestEvent.hookEventName);
          }
        }
      } catch {
        setThreadStatus('error');
      }
    },
    [reportClaudeActivity],
  );

  const openThreadPanel = useCallback(
    (message: ChannelMessage) => {
      setSelectedMessageId(message.id);
      setSelectedMessage(message);
      setThreadWidth(clamp(Math.floor(window.innerWidth * 0.5), 280, 600));
      resetThreadViewState();
      void loadThreadEvents(message);
    },
    [loadThreadEvents, resetThreadViewState],
  );

  const deleteWorktree = useCallback(async () => {
    const message = selectedMessageRef.current;
    if (!message) return;

    const confirmed = window.confirm('Delete this thread worktree? This removes local files for this message.');
    if (!confirmed) return;

    setDeletingWorktree(true);
    try {
      const result = await window.traceAPI.deleteWorktree(message.id);
      if (!result.success) {
        console.error('Failed to delete worktree:', result.error);
        return;
      }
      console.log(
        result.removed
          ? `Deleted worktree: ${result.worktreePath}`
          : `Worktree already missing: ${result.worktreePath}`,
      );
    } finally {
      setDeletingWorktree(false);
    }
  }, []);

  const toggleReadGroup = useCallback((groupId: string) => {
    setExpandedReadGroupIds((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  return {
    selectedMessageId,
    selectedMessage,
    selectedMessageRef,
    selectedMessageIdRef,
    activeThreadId,
    threadEvents,
    threadStatus,
    threadWidth,
    setThreadWidth,
    threadOpen,
    deletingWorktree,
    showJumpToLatest,
    setShowJumpToLatest,
    expandedReadGroupIds,
    reportClaudeActivity,
    closeThreadPanel,
    loadThreadEvents,
    openThreadPanel,
    deleteWorktree,
    toggleReadGroup,
  };
}
