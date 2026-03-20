import { useEffect, useMemo, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { DmWelcome } from "./DmWelcome";
import { useEntityStore } from "../../stores/entity";
import { useShallow } from "zustand/react/shallow";

/** Max gap in ms between messages from the same user to be grouped (5 min like Slack) */
const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

export function ChatMessageList({
  chatId,
  messageIds,
  loading,
  hasOlder,
  onLoadOlder,
}: {
  chatId: string;
  messageIds: string[];
  loading: boolean;
  hasOlder: boolean;
  onLoadOlder: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Subscribe to only the messages we need for grouping decisions.
  const messages = useEntityStore(
    useShallow((state) =>
      messageIds.map((id) => state.messages[id] ?? null),
    ),
  );

  // Group consecutive top-level messages from the same actor when they are
  // close together in time.
  const groupedFlags = useMemo(() => {
    const flags: boolean[] = new Array(messages.length).fill(false);
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1];
      const curr = messages[i];
      if (!prev || !curr) continue;
      const prevActorId = (prev.actor as { id?: string })?.id ?? null;
      const currActorId = (curr.actor as { id?: string })?.id ?? null;
      const sameActor = prevActorId != null && prevActorId === currActorId;
      const timeDiff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
      const neitherIsReply = !prev.parentMessageId && !curr.parentMessageId;
      flags[i] = sameActor && timeDiff < GROUP_THRESHOLD_MS && neitherIsReply;
    }
    return flags;
  }, [messages]);

  // Scroll to bottom instantly when entering a chat
  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView();
    }
    prevChatIdRef.current = chatId;
    wasAtBottomRef.current = true;
  }, [chatId, loading]);

  // Auto-scroll to bottom smoothly when new messages arrive
  useEffect(() => {
    if (wasAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageIds.length]);

  // Track scroll position
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    // Load older when near top
    if (el.scrollTop < 50 && hasOlder) {
      onLoadOlder();
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {messageIds.length === 0 ? (
        <div className="flex h-full flex-col">
          <div className="flex-1" />
          <DmWelcome chatId={chatId} />
        </div>
      ) : (
        <div className="py-2">
          {!hasOlder && <DmWelcome chatId={chatId} />}
          {messageIds.map((id, idx) => (
            <ChatMessage key={id} messageId={id} isGrouped={groupedFlags[idx]} />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
