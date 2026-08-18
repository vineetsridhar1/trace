import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import type { SessionMessage } from "@trace/gql";
import { client } from "../lib/urql";

const PAGE_SIZE = 100;
const SESSION_MESSAGES_QUERY = gql`
  query SessionMessages($sessionId: ID!, $before: DateTime, $beforeMessageId: ID, $limit: Int) {
    sessionMessages(
      sessionId: $sessionId
      before: $before
      beforeMessageId: $beforeMessageId
      limit: $limit
    ) {
      id
      role
      actor { id type name avatarUrl }
      text
      content
      attachments
      sourceEventId
      createdAt
    }
  }
`;

type MessagePage = { sessionMessages?: SessionMessage[] };

export function useSessionMessages(sessionId: string, skip = false) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loading, setLoading] = useState(!skip);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasOlder, setHasOlder] = useState(false);

  const fetchPage = useCallback(
    async (before?: { createdAt: string; id: string }) => {
      const result = await client
        .query<MessagePage>(SESSION_MESSAGES_QUERY, {
          sessionId,
          limit: PAGE_SIZE,
          before: before?.createdAt,
          beforeMessageId: before?.id,
        })
        .toPromise();
      if (result.error) throw result.error;
      return result.data?.sessionMessages ?? [];
    },
    [sessionId],
  );

  useEffect(() => {
    if (skip) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPage()
      .then((page) => {
        if (cancelled) return;
        setMessages(page);
        setHasOlder(page.length === PAGE_SIZE);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError : new Error("Failed to load messages"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, skip]);

  const fetchOlder = useCallback(async () => {
    const first = messages[0];
    if (!first || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchPage(first);
      setMessages((current) => [...page, ...current]);
      setHasOlder(page.length === PAGE_SIZE);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError : new Error("Failed to load messages"));
    } finally {
      setLoadingOlder(false);
    }
  }, [fetchPage, hasOlder, loadingOlder, messages]);

  return { messages, loading, loadingOlder, hasOlder, error, fetchOlder };
}
