import { useCallback, useRef, useState } from "react";
import { gql, useApolloClient } from "@apollo/client";
import type { ChannelMessage, ServerEvent, ThreadStatus } from "../types";
import {
  ThreadsDocument,
  type ThreadsQuery,
  ThreadEventsDocument,
  type ThreadEventsQuery,
  useCreateThreadMutation,
} from "./__generated__/useThread.generated";
import { clamp } from "../utils";

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
  const client = useApolloClient();
  const [executeCreateThread] = useCreateThreadMutation();

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [selectedMessage, setSelectedMessage] = useState<ChannelMessage | null>(
    null,
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [threadEvents, setThreadEvents] = useState<ServerEvent[]>([]);
  const [threadStatus, setThreadStatus] = useState<ThreadStatus>("idle");
  const [threadWidth, setThreadWidth] = useState(0);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [mergingWorktree, setMergingWorktree] = useState(false);
  const [hasWorktree, setHasWorktree] = useState<boolean | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [expandedReadGroupIds, setExpandedReadGroupIds] = useState<
    Record<string, boolean>
  >({});
  const [threadTotal, setThreadTotal] = useState(0);
  const [loadingOlderEvents, setLoadingOlderEvents] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  const [latestContextTokens, setLatestContextTokens] = useState(0);
  const lastSeenUsageRef = useRef<{ input: number; output: number }>({
    input: 0,
    output: 0,
  });

  const selectedMessageRef = useRef<ChannelMessage | null>(null);
  const selectedMessageIdRef = useRef<string | null>(null);
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

  selectedMessageRef.current = selectedMessage;
  selectedMessageIdRef.current = selectedMessageId;
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
    setTokenUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    setLatestContextTokens(0);
    lastSeenUsageRef.current = { input: 0, output: 0 };
  }, []);

  const closeThreadPanel = useCallback(() => {
    setSelectedMessageId(null);
    setSelectedMessage(null);
    setActiveThreadId(null);
    setThreads([]);
    setThreadEvents([]);
    setThreadStatus("idle");
    setThreadWidth(0);
    resetThreadViewState();
  }, [resetThreadViewState]);

  // Load events for a specific thread by ID
  const loadEventsForThread = useCallback(
    async (channelId: string, messageId: string, threadId: string) => {
      resetThreadViewState();

      const { data: eventsData } = await client.query<ThreadEventsQuery>({
        query: ThreadEventsDocument,
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

      const tu = result?.tokenUsage;
      if (tu) {
        setTokenUsage({
          inputTokens: tu.inputTokens,
          outputTokens: tu.outputTokens,
          totalTokens: tu.totalTokens,
        });
      }
      setLatestContextTokens(result?.latestContextTokens ?? 0);

      const lastLoadedEvent = events[events.length - 1];
      if (lastLoadedEvent) {
        const lastUsage = (
          lastLoadedEvent.rawPayload as Record<string, unknown>
        )?.usage as
          | { input_tokens?: number; output_tokens?: number }
          | undefined;
        lastSeenUsageRef.current = {
          input: lastUsage?.input_tokens ?? 0,
          output: lastUsage?.output_tokens ?? 0,
        };
      }
    },
    [client, resetThreadViewState],
  );

  const loadThreadEvents = useCallback(
    async (message: ChannelMessage) => {
      try {
        // Only show "loading" on initial load, not on incremental SSE updates
        setThreadStatus((prev) =>
          prev === "idle" || prev === "error" ? "loading" : prev,
        );

        // Fetch threads to get the latest thread ID (for SSE routing)
        const { data: threadsData } = await client.query<ThreadsQuery>({
          query: ThreadsDocument,
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

        // Set active thread to the latest thread and load its events
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
    [client, loadEventsForThread, reportClaudeActivity],
  );

  const loadOlderEvents = useCallback(async (): Promise<number> => {
    const query = threadQueryRef.current;
    if (loadingOlderRef.current || !query) return 0;
    loadingOlderRef.current = true;
    setLoadingOlderEvents(true);
    try {
      const { data } = await client.query<ThreadEventsQuery>({
        query: ThreadEventsDocument,
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
  }, [client]);

  const appendThreadEvent = useCallback((event: ServerEvent) => {
    setThreadEvents((prev) => [...prev, event]);
    setThreadTotal((prev) => prev + 1);

    // Keep the active thread's eventCount in sync for the history dropdown
    const currentThreadId = activeThreadIdRef.current;
    if (currentThreadId) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === currentThreadId ? { ...t, eventCount: t.eventCount + 1 } : t,
        ),
      );
    }

    // Incrementally update token aggregates from the new event.
    // Deduplicate: multiple events in the same API turn share the same usage snapshot.
    const usage = (event.rawPayload as Record<string, unknown>)?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    if (usage) {
      const curInput = usage.input_tokens ?? 0;
      const curOutput = usage.output_tokens ?? 0;
      if (
        curInput !== lastSeenUsageRef.current.input ||
        curOutput !== lastSeenUsageRef.current.output
      ) {
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
    if (
      !window.traceAPI ||
      typeof window.traceAPI.checkWorktreeExists !== "function"
    ) {
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

      // Add the new thread to the list and switch to it
      setThreads((prev) => [...prev, newThread]);
      setActiveThreadId(newThread.id);
      activeThreadIdRef.current = newThread.id; // sync ref immediately for callers that read it after await
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

  const deleteWorktree = useCallback(
    async (onDeleted?: (messageId: string) => void) => {
      const message = selectedMessageRef.current;
      if (!message) return;

      const confirmed = window.confirm(
        "Delete this worktree? This removes local files for this workspace.",
      );
      if (!confirmed) return;

      setDeletingWorktree(true);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.deleteWorktree(
          message.id,
          repoPath,
        );
        if (!result.success) {
          console.error("Failed to delete worktree:", result.error);
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
    },
    [getChannelRepoPath],
  );

  const mergeWorktree = useCallback(async () => {
    const message = selectedMessageRef.current;
    if (!message) return;

    const baseBranch = getChannelBaseBranch();
    const confirmed = window.confirm(
      `Merge this worktree branch into ${baseBranch}?`,
    );
    if (!confirmed) return;

    setMergingWorktree(true);
    try {
      const repoPath = getChannelRepoPath();
      const result = await window.traceAPI.mergeWorktree(
        message.id,
        repoPath,
        baseBranch,
      );
      if (!result.success) {
        console.error("Failed to merge worktree:", result.error);
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
  };
}
