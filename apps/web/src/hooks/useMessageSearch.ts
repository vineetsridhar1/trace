import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../lib/urql";

const SEARCH_MESSAGES_QUERY = gql`
  query SearchMessages($query: String!) {
    searchMessages(query: $query) {
      id
      chatId
      channelId
      sessionId
      sessionGroupId
      text
    }
  }
`;

export interface MessageSearchResult {
  id: string;
  chatId: string | null;
  channelId: string | null;
  sessionId: string | null;
  sessionGroupId: string | null;
  text: string;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

/**
 * Debounced server-side search over message bodies visible to the user.
 * Returns the latest results for the trimmed query, or an empty list while the
 * query is too short. Stale in-flight requests are ignored so results never race.
 */
export function useMessageSearch(query: string): MessageSearchResult[] {
  const [results, setResults] = useState<MessageSearchResult[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      void client
        .query(SEARCH_MESSAGES_QUERY, { query: trimmed }, { requestPolicy: "network-only" })
        .toPromise()
        .then((result) => {
          if (cancelled) return;
          setResults((result.data?.searchMessages ?? []) as MessageSearchResult[]);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  return results;
}
