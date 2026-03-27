import { useEffect, useReducer, useRef } from "react";
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

const INITIAL_STATE: ChatStreamState = {
  isAgentTyping: false,
  streamingText: "",
  agentId: null,
};

type Action =
  | { type: "TYPING_START"; actorId: string }
  | { type: "TEXT_DELTA"; text: string }
  | { type: "CLEAR" };

function reducer(state: ChatStreamState, action: Action): ChatStreamState {
  switch (action.type) {
    case "TYPING_START":
      return { isAgentTyping: true, streamingText: "", agentId: action.actorId };
    case "TEXT_DELTA":
      return { ...state, streamingText: state.streamingText + action.text };
    case "CLEAR":
      return INITIAL_STATE;
  }
}

/**
 * Subscribe to the `chatStream` subscription for a given chat.
 * Provides real-time typing indicators and streaming text from the agent.
 */
export function useChatStream(chatId: string): ChatStreamState {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use a ref for dispatch so the effect never re-subscribes due to callback identity
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const clearStaleTimer = () => {
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
    };

    const resetStaleTimer = () => {
      clearStaleTimer();
      staleTimerRef.current = setTimeout(() => {
        dispatchRef.current({ type: "CLEAR" });
      }, STALE_TIMEOUT_MS);
    };

    const sub = client
      .subscription(CHAT_STREAM_SUBSCRIPTION, { chatId })
      .subscribe((result) => {
        const event = result.data?.chatStream as
          | { chatId: string; actorId: string; type: string; text: string | null }
          | undefined;
        if (!event) return;

        switch (event.type) {
          case "TYPING_START":
            dispatchRef.current({ type: "TYPING_START", actorId: event.actorId });
            resetStaleTimer();
            break;

          case "TEXT_DELTA":
            if (event.text) {
              dispatchRef.current({ type: "TEXT_DELTA", text: event.text });
            }
            resetStaleTimer();
            break;

          case "TYPING_STOP":
            dispatchRef.current({ type: "CLEAR" });
            clearStaleTimer();
            break;
        }
      });

    return () => {
      sub.unsubscribe();
      dispatchRef.current({ type: "CLEAR" });
      clearStaleTimer();
    };
  }, [chatId]);

  return state;
}
