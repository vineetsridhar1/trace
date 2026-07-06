import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../lib/urql";

const SEARCH_MESSAGES_QUERY = gql`
  query SearchMessagesPage($query: String!, $limit: Int) {
    searchMessages(query: $query, limit: $limit) {
      id
      chatId
      channelId
      text
      createdAt
      actor {
        type
        id
        name
        avatarUrl
      }
    }
  }
`;

export interface SearchMessageResult {
  id: string;
  chatId: string | null;
  channelId: string | null;
  text: string;
  createdAt: string;
  actor: { type: string; id: string; name: string | null; avatarUrl: string | null };
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

/**
 * Debounced server-side message search for the full results page. Tracks a
 * loading flag and ignores stale in-flight responses so results never race.
 */
export function useSearchMessages(
  query: string,
  limit = 50,
): { results: SearchMessageResult[]; loading: boolean } {
  const [results, setResults] = useState<SearchMessageResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      void client
        .query(
          SEARCH_MESSAGES_QUERY,
          { query: trimmed, limit },
          { requestPolicy: "network-only" },
        )
        .toPromise()
        .then((result) => {
          if (cancelled) return;
          setResults((result.data?.searchMessages ?? []) as SearchMessageResult[]);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, limit]);

  return { results, loading };
}
