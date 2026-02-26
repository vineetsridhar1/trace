import { useCallback, useRef, useState } from "react";
import { gql } from "@apollo/client";
import type { ChannelMessage, ServerEvent, ThreadStatus } from "../types";
import {
  useCreateThreadMutation,
  useThreadsLazyQuery,
  useThreadEventsLazyQuery,
} from "./__generated__/useThread.generated";
import { clamp } from "../utils";
import { useTokenTracking } from "./useTokenTracking";
import { useWorktreeState } from "./useWorktreeState";
import { useThreadSelection } from "./useThreadSelection";

export interface ThreadInfo {
  id: string;
  messageId: string;
  createdAt: string;
  eventCount: number;
}

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
  query ThreadEvents(
    $channelId: ID!
    $messageId: ID!
    $threadId: ID!
    $limit: Int
    $offset: Int
    $after: String
  ) {
    threadEvents(
      channelId: $channelId
      messageId: $messageId
      threadId: $threadId
      limit: $limit
      offset: $offset
      after: $after
    ) {
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
      cliCostUsd
    }
  }
`;

const GQL_CREATE_THREAD = gql`
  mutation CreateThread($channelId: ID!, $messageId: ID!) {
    createThread(channelId: $channelId, messageId: $messageId) {
      id
      messageId
      createdAt
      eventCount
    }
  }
`;

interface UseThreadOptions {
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
  getActiveChannelId: () => string | null;
}

const THREAD_PAGE_SIZE = 100;

export function useThread({
  getChannelRepoPath,
  getChannelBaseBranch,
  getActiveChannelId,
}: UseThreadOptions) {
  const [executeThreads] = useThreadsLazyQuery();
  const [executeThreadEvents] = useThreadEventsLazyQuery();
  const [executeCreateThread] = useCreateThreadMutation();

  // Composed hooks
  const {
    selectedMessageId,
    selectedMessage,
    selectedMessageRef,
    selectedMessageIdRef,
    syncSelectedMessage,
    clearSelection,
    selectMessage,
  } = useThreadSelection();
  const {
    tokenUsage,
    latestContextTokens,
    cliCostUsd,
    trackEventTokens,
    trackEventTokenUpdate,
    resetTokenTracking,
    applyLoadedTokenData,
  } = useTokenTracking();
  const {
    hasWorktree,
    setHasWorktree,
    deletingWorktree,
    mergingWorktree,
    checkWorktree,
    deleteWorktree,
    mergeWorktree,
  } = useWorktreeState({
    getChannelRepoPath,
    getChannelBaseBranch,
    selectedMessageRef,
  });

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [threadEvents, setThreadEvents] = useState<ServerEvent[]>([]);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus>("idle");
  const [threadWidth, setThreadWidth] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [expandedReadGroupIds, setExpandedReadGroupIds] = useState<
    Record<string, boolean>
  >({});
  const [threadTotal, setThreadTotal] = useState(0);
  const [loadingOlderEvents, setLoadingOlderEvents] = useState(false);

  const activeThreadIdRef = useRef<string | null>(null);
  const lastReportedThreadEventIdByMessageRef = useRef<Map<string, string>>(
    new Map(),
  );
  const loadingOlderRef = useRef(false);
  const threadQueryRef = useRef<{
    channelId: string;
    messageId: string;
    threadId: string;
  } | null>(null);
  const threadEventsLengthRef = useRef(0);
  const threadEventsRef = useRef<ServerEvent[]>([]);
  threadEventsLengthRef.current = threadEvents.length;
  threadEventsRef.current = threadEvents;

  activeThreadIdRef.current = activeThreadId;

  const threadOpen = threadWidth > 0;

  const reportClaudeActivity = useCallback(
    async (messageId: string, eventType: string) => {
      if (
        !window.traceAPI ||
        typeof window.traceAPI.reportClaudeActivity !== "function"
      )
        return;
      try {
        await window.traceAPI.reportClaudeActivity(messageId, eventType);
      } catch {
        // best-effort
      }
    },
    [],
  );

  const resetThreadViewState = useCallback(() => {
    setShowJumpToLatest(false);
    setExpandedReadGroupIds({});
    setThreadTotal(0);
    setLoadingOlderEvents(false);
    loadingOlderRef.current = false;
    threadQueryRef.current = null;
    resetTokenTracking();
  }, [resetTokenTracking]);

  const closeThreadPanel = useCallback(() => {
    clearSelection();
    setActiveThreadId(null);
    setThreads([]);
    setThreadEvents([]);
    setThreadStatus("idle");
    setThreadWidth(0);
    resetThreadViewState();
  }, [resetThreadViewState, clearSelection]);

  // Load events for a specific thread by ID
  const loadEventsForThread = useCallback(
    async (channelId: string, messageId: string, threadId: string) => {
      resetThreadViewState();

      const { data: eventsData } = await executeThreadEvents({
        variables: {
          channelId,
          messageId,
          threadId,
          limit: THREAD_PAGE_SIZE,
        },
      });

      const result = eventsData?.threadEvents;
      const events: ServerEvent[] = (result?.events ?? []) as ServerEvent[];
      const total = result?.total ?? events.length;
      setThreadEvents(events);
      setThreadTotal(total);
      threadQueryRef.current = { channelId, messageId, threadId };
      setThreadStatus(events.length === 0 ? "empty" : "ready");

      applyLoadedTokenData({
        tokenUsage: result?.tokenUsage,
        latestContextTokens: result?.latestContextTokens,
        cliCostUsd: result?.cliCostUsd,
        lastEvent: events[events.length - 1] ?? null,
      });
    },
    [executeThreadEvents, resetThreadViewState, applyLoadedTokenData],
  );

  const loadThreadEvents = useCallback(
    async (message: ChannelMessage) => {
      try {
        setThreadStatus((prev) =>
          prev === "idle" || prev === "error" ? "loading" : prev,
        );

        const { data: threadsData } = await executeThreads({
          variables: {
            channelId: message.channelId,
            messageId: message.id,
          },
        });

        const threadList = (threadsData?.threads ?? []) as ThreadInfo[];
        setThreads(threadList);

        if (threadList.length === 0) {
          setActiveThreadId(null);
          setThreadEvents([]);
          setThreadStatus("empty");
          return;
        }

        const latestThread = threadList[threadList.length - 1];
        setActiveThreadId(latestThread.id);
        await loadEventsForThread(message.channelId, message.id, latestThread.id);

        const latestEvent =
          threadEventsRef.current[threadEventsRef.current.length - 1];
        if (latestEvent) {
          const lastReportedId =
            lastReportedThreadEventIdByMessageRef.current.get(message.id);
          if (lastReportedId !== latestEvent.id) {
            lastReportedThreadEventIdByMessageRef.current.set(
              message.id,
              latestEvent.id,
            );
            void reportClaudeActivity(message.id, latestEvent.hookEventName);
          }
        }
      } catch {
        setThreadStatus("error");
      }
    },
    [executeThreads, loadEventsForThread, reportClaudeActivity],
  );

  const loadOlderEvents = useCallback(async (): Promise<number> => {
    const query = threadQueryRef.current;
    if (loadingOlderRef.current || !query) return 0;
    loadingOlderRef.current = true;
    setLoadingOlderEvents(true);
    try {
      const { data } = await executeThreadEvents({
        variables: {
          channelId: query.channelId,
          messageId: query.messageId,
          threadId: query.threadId,
          limit: THREAD_PAGE_SIZE,
          offset: threadEventsLengthRef.current,
        },
      });

      const result = data?.threadEvents;
      const olderEvents: ServerEvent[] = (result?.events ??
        []) as ServerEvent[];
      const total = result?.total;
      if (total != null) setThreadTotal(total);
      if (olderEvents.length > 0) {
        setThreadEvents((prev) => [...olderEvents, ...prev]);
      }
      return olderEvents.length;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderEvents(false);
    }
  }, [executeThreadEvents]);

  const appendThreadEvent = useCallback(
    (event: ServerEvent) => {
      setThreadEvents((prev) => [...prev, event]);
      setThreadTotal((prev) => prev + 1);

      const currentThreadId = activeThreadIdRef.current;
      if (currentThreadId) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === currentThreadId ? { ...t, eventCount: t.eventCount + 1 } : t,
          ),
        );
      }

      trackEventTokens(event);
    },
    [trackEventTokens],
  );

  const updateThreadEvent = useCallback(
    (event: ServerEvent) => {
      setThreadEvents((prev) =>
        prev.map((e) => (e.id === event.id ? event : e)),
      );
      trackEventTokenUpdate(event);
    },
    [trackEventTokenUpdate],
  );

  const hasMoreEvents = threadTotal > threadEvents.length;

  const openThreadPanel = useCallback(
    (message: ChannelMessage) => {
      selectMessage(message);
      setHasWorktree(null);
      setThreadWidth(clamp(Math.floor(window.innerWidth * 0.5), 280, 600));
      resetThreadViewState();
      void loadThreadEvents(message);
      void checkWorktree(message.id);
    },
    [loadThreadEvents, resetThreadViewState, checkWorktree, selectMessage],
  );

  const switchThread = useCallback(
    async (threadId: string) => {
      const message = selectedMessageRef.current;
      if (!message) return;

      setActiveThreadId(threadId);
      setThreadStatus("loading");

      try {
        await loadEventsForThread(message.channelId, message.id, threadId);
      } catch {
        setThreadStatus("error");
      }
    },
    [loadEventsForThread],
  );

  const clearThread = useCallback(async (): Promise<string | null> => {
    const message = selectedMessageRef.current;
    const channelId = getActiveChannelId();
    if (!message || !channelId) return null;

    try {
      const { data } = await executeCreateThread({
        variables: {
          channelId,
          messageId: message.id,
        },
      });

      const newThread = data?.createThread as ThreadInfo | undefined;
      if (!newThread) return null;

      setThreads((prev) => [...prev, newThread]);
      setActiveThreadId(newThread.id);
      activeThreadIdRef.current = newThread.id;
      setThreadEvents([]);
      setThreadTotal(0);
      setThreadStatus("empty");
      resetThreadViewState();
      threadQueryRef.current = {
        channelId,
        messageId: message.id,
        threadId: newThread.id,
      };
      return newThread.id;
    } catch (err) {
      console.error("Failed to clear thread:", err);
      return null;
    }
  }, [executeCreateThread, getActiveChannelId, resetThreadViewState]);

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
    activeThreadIdRef,
    threads,
    threadEvents,
    threadEventsRef,
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
    updateThreadEvent,
    hasMoreEvents,
    loadingOlderEvents,
    openThreadPanel,
    switchThread,
    clearThread,
    deleteWorktree,
    mergeWorktree,
    toggleReadGroup,
    syncSelectedMessage,
    tokenUsage,
    latestContextTokens,
    cliCostUsd,
  };
}
