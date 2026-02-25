import { useCallback, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import type { ChannelMessage, ServerEvent, ThreadStatus } from '../types';
import { graphqlClient } from '../graphql/client';
import { ThreadsDocument, ThreadEventsDocument, type ThreadsQuery, type ThreadEventsQuery } from './__generated__/useThread.generated';
import { clamp } from '../utils';

const GQL_THREADS = gql`
  query Threads($channelId: ID!, $messageId: ID!) {
    threads(channelId: $channelId, messageId: $messageId) {
      id
      messageId
      createdAt
      eventCount
    }
  }
`;

const GQL_THREAD_EVENTS = gql`
  query ThreadEvents($channelId: ID!, $messageId: ID!, $threadId: ID!, $limit: Int, $offset: Int, $after: String) {
    threadEvents(channelId: $channelId, messageId: $messageId, threadId: $threadId, limit: $limit, offset: $offset, after: $after) {
      events {
        id
        sessionId
        hookEventName
        timestamp
        toolName
        toolInput
        toolResponse
        toolUseId
        stopHookActive
        lastAssistantMessage
        rawPayload
        threadId
        importance
      }
      total
      limit
      offset
      tokenUsage {
        inputTokens
        outputTokens
        totalTokens
      }
      latestContextTokens
    }
  }
`;

interface UseThreadOptions {
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
}

const THREAD_PAGE_SIZE = 100;

export function useThread({ getChannelRepoPath, getChannelBaseBranch }: UseThreadOptions) {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChannelMessage | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadEvents, setThreadEvents] = useState<ServerEvent[]>([]);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus>('idle');
  const [threadWidth, setThreadWidth] = useState(0);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [mergingWorktree, setMergingWorktree] = useState(false);
  const [hasWorktree, setHasWorktree] = useState<boolean | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [expandedReadGroupIds, setExpandedReadGroupIds] = useState<Record<string, boolean>>({});
  const [threadTotal, setThreadTotal] = useState(0);
  const [loadingOlderEvents, setLoadingOlderEvents] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number }>({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  const [latestContextTokens, setLatestContextTokens] = useState(0);
  const lastSeenUsageRef = useRef<{ input: number; output: number }>({ input: 0, output: 0 });

  const selectedMessageRef = useRef<ChannelMessage | null>(null);
  const selectedMessageIdRef = useRef<string | null>(null);
  const lastReportedThreadEventIdByMessageRef = useRef<Map<string, string>>(new Map());
  const loadingOlderRef = useRef(false);
  const threadQueryRef = useRef<{ channelId: string; messageId: string; threadId: string } | null>(null);
  const threadEventsLengthRef = useRef(0);
  threadEventsLengthRef.current = threadEvents.length;

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
    setThreadTotal(0);
    setLoadingOlderEvents(false);
    loadingOlderRef.current = false;
    threadQueryRef.current = null;
    setTokenUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    setLatestContextTokens(0);
    lastSeenUsageRef.current = { input: 0, output: 0 };
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
        // Only show "loading" on initial load, not on incremental SSE updates
        setThreadStatus((prev) => (prev === 'idle' || prev === 'error' ? 'loading' : prev));

        const { data: threadsData } = await graphqlClient.query<ThreadsQuery>({
          query: ThreadsDocument,
          variables: {
            channelId: message.channelId,
            messageId: message.id,
          },
        });

        const threads = threadsData?.threads ?? [];
        if (threads.length === 0) {
          setActiveThreadId(null);
          setThreadEvents([]);
          setThreadStatus('empty');
          return;
        }

        const thread = threads[0];
        setActiveThreadId(thread.id);

        const { data: eventsData } = await graphqlClient.query<ThreadEventsQuery>({
          query: ThreadEventsDocument,
          variables: {
            channelId: message.channelId,
            messageId: message.id,
            threadId: thread.id,
            limit: THREAD_PAGE_SIZE,
          },
        });

        const events: ServerEvent[] = (eventsData?.threadEvents?.events ?? []) as ServerEvent[];
        const total = eventsData?.threadEvents?.total ?? events.length;
        setThreadEvents(events);
        setThreadTotal(total);
        threadQueryRef.current = { channelId: message.channelId, messageId: message.id, threadId: thread.id };
        setThreadStatus(events.length === 0 ? 'empty' : 'ready');

        // Set server-computed token aggregates
        const tu = eventsData?.threadEvents?.tokenUsage;
        if (tu) {
          setTokenUsage({ inputTokens: tu.inputTokens, outputTokens: tu.outputTokens, totalTokens: tu.totalTokens });
        }
        setLatestContextTokens(eventsData?.threadEvents?.latestContextTokens ?? 0);

        // Set baseline for SSE dedup from the last event's usage
        const lastLoadedEvent = events[events.length - 1];
        if (lastLoadedEvent) {
          const lastUsage = (lastLoadedEvent.rawPayload as Record<string, unknown>)?.usage as
            | { input_tokens?: number; output_tokens?: number }
            | undefined;
          lastSeenUsageRef.current = {
            input: lastUsage?.input_tokens ?? 0,
            output: lastUsage?.output_tokens ?? 0,
          };
        }

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

  const loadOlderEvents = useCallback(async (): Promise<number> => {
    const query = threadQueryRef.current;
    if (loadingOlderRef.current || !query) return 0;
    loadingOlderRef.current = true;
    setLoadingOlderEvents(true);
    try {
      const { data } = await graphqlClient.query<ThreadEventsQuery>({
        query: ThreadEventsDocument,
        variables: {
          ...query,
          limit: THREAD_PAGE_SIZE,
          offset: threadEventsLengthRef.current,
        },
      });

      const olderEvents: ServerEvent[] = (data?.threadEvents?.events ?? []) as ServerEvent[];
      const total = data?.threadEvents?.total;
      if (total != null) setThreadTotal(total);
      if (olderEvents.length > 0) {
        setThreadEvents((prev) => [...olderEvents, ...prev]);
      }
      return olderEvents.length;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderEvents(false);
    }
  }, []);

  const appendThreadEvent = useCallback((event: ServerEvent) => {
    setThreadEvents((prev) => [...prev, event]);
    setThreadTotal((prev) => prev + 1);

    // Incrementally update token aggregates from the new event.
    // Deduplicate: multiple events in the same API turn share the same usage snapshot.
    const usage = (event.rawPayload as Record<string, unknown>)?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    if (usage) {
      const curInput = usage.input_tokens ?? 0;
      const curOutput = usage.output_tokens ?? 0;
      if (curInput !== lastSeenUsageRef.current.input || curOutput !== lastSeenUsageRef.current.output) {
        lastSeenUsageRef.current = { input: curInput, output: curOutput };
        setTokenUsage((prev) => ({
          inputTokens: prev.inputTokens + curInput,
          outputTokens: prev.outputTokens + curOutput,
          totalTokens: prev.totalTokens + curInput + curOutput,
        }));
      }
      if (curInput) {
        setLatestContextTokens(curInput);
      }
    }
  }, []);

  const hasMoreEvents = threadTotal > threadEvents.length;

  const checkWorktree = useCallback(async (messageId: string) => {
    if (!window.traceAPI || typeof window.traceAPI.checkWorktreeExists !== 'function') {
      setHasWorktree(false);
      return;
    }
    try {
      const result = await window.traceAPI.checkWorktreeExists(messageId);
      setHasWorktree(result.success && result.exists === true);
    } catch {
      setHasWorktree(false);
    }
  }, []);

  const openThreadPanel = useCallback(
    (message: ChannelMessage) => {
      setSelectedMessageId(message.id);
      setSelectedMessage(message);
      setHasWorktree(null);
      setThreadWidth(clamp(Math.floor(window.innerWidth * 0.5), 280, 600));
      resetThreadViewState();
      void loadThreadEvents(message);
      void checkWorktree(message.id);
    },
    [loadThreadEvents, resetThreadViewState, checkWorktree],
  );

  const deleteWorktree = useCallback(async (onDeleted?: (messageId: string) => void) => {
    const message = selectedMessageRef.current;
    if (!message) return;

    const confirmed = window.confirm('Delete this worktree? This removes local files for this workspace.');
    if (!confirmed) return;

    setDeletingWorktree(true);
    try {
      const repoPath = getChannelRepoPath();
      const result = await window.traceAPI.deleteWorktree(message.id, repoPath);
      if (!result.success) {
        console.error('Failed to delete worktree:', result.error);
        return;
      }
      console.log(
        result.removed
          ? `Deleted worktree: ${result.worktreePath}`
          : `Worktree already missing: ${result.worktreePath}`,
      );
      setHasWorktree(false);
      onDeleted?.(message.id);
    } finally {
      setDeletingWorktree(false);
    }
  }, [getChannelRepoPath]);

  const mergeWorktree = useCallback(async () => {
    const message = selectedMessageRef.current;
    if (!message) return;

    const baseBranch = getChannelBaseBranch();
    const confirmed = window.confirm(`Merge this worktree branch into ${baseBranch}?`);
    if (!confirmed) return;

    setMergingWorktree(true);
    try {
      const repoPath = getChannelRepoPath();
      const result = await window.traceAPI.mergeWorktree(message.id, repoPath, baseBranch);
      if (!result.success) {
        console.error('Failed to merge worktree:', result.error);
        return;
      }
      console.log(`Merged branch ${result.branch} into ${baseBranch}`);
    } finally {
      setMergingWorktree(false);
    }
  }, [getChannelBaseBranch, getChannelRepoPath]);

  const toggleReadGroup = useCallback((groupId: string) => {
    setExpandedReadGroupIds((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  const syncSelectedMessage = useCallback((message: ChannelMessage) => {
    setSelectedMessage((current) => {
      if (current && current.id === message.id) return message;
      return current;
    });
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
    mergingWorktree,
    hasWorktree,
    setHasWorktree,
    showJumpToLatest,
    setShowJumpToLatest,
    expandedReadGroupIds,
    reportClaudeActivity,
    closeThreadPanel,
    loadThreadEvents,
    loadOlderEvents,
    appendThreadEvent,
    hasMoreEvents,
    loadingOlderEvents,
    openThreadPanel,
    deleteWorktree,
    mergeWorktree,
    toggleReadGroup,
    syncSelectedMessage,
    tokenUsage,
    latestContextTokens,
  };
}
