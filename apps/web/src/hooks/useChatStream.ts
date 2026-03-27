import { useCallback, useEffect, useRef, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../lib/urql";

const CHAT_STREAM_SUBSCRIPTION = gql`
  subscription ChatStream($chatId: ID!) {
    chatStream(chatId: $chatId) {
      chatId
      actorId
      type
      text
    }
  }
`;

/** How long to wait before auto-clearing a stale typing indicator. */
const STALE_TIMEOUT_MS = 30_000;

export interface ChatStreamState {
  /** Whether the agent is currently typing or streaming. */
  isAgentTyping: boolean;
  /** Accumulated streaming text (empty until TEXT_DELTA events arrive). */
  streamingText: string;
  /** The agent's actor ID (for rendering avatar/name). */
  agentId: string | null;
}

/**
 * Subscribe to the `chatStream` subscription for a given chat.
 * Provides real-time typing indicators and streaming text from the agent.
 */
export function useChatStream(chatId: string): ChatStreamState {
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearState = useCallback(() => {
    setIsAgentTyping(false);
    setStreamingText("");
    setAgentId(null);
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const resetStaleTimer = useCallback(() => {
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
    }
    staleTimerRef.current = setTimeout(() => {
      clearState();
    }, STALE_TIMEOUT_MS);
  }, [clearState]);

  useEffect(() => {
    const sub = client
      .subscription(CHAT_STREAM_SUBSCRIPTION, { chatId })
      .subscribe((result) => {
        const event = result.data?.chatStream as
          | { chatId: string; actorId: string; type: string; text: string | null }
          | undefined;
        if (!event) return;

        switch (event.type) {
          case "TYPING_START":
            setIsAgentTyping(true);
            setStreamingText("");
            setAgentId(event.actorId);
            resetStaleTimer();
            break;

          case "TEXT_DELTA":
            if (event.text) {
              setStreamingText((prev) => prev + event.text);
            }
            resetStaleTimer();
            break;

          case "TYPING_STOP":
            clearState();
            break;
        }
      });

    return () => {
      sub.unsubscribe();
      clearState();
    };
  }, [chatId, clearState, resetStaleTimer]);

  // Clear streaming state when chatId changes
  useEffect(() => {
    return () => clearState();
  }, [chatId, clearState]);

  return { isAgentTyping, streamingText, agentId };
}
