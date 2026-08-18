import { useEffect, useRef } from "react";
import type { SessionMessage } from "@trace/gql";
import { AssistantText } from "./messages/AssistantText";
import { UserBubble } from "./messages/UserBubble";

function attachmentKeys(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;
}

export function DurableSessionMessageList({
  messages,
  loading,
  error,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  bottomPadding,
}: {
  messages: SessionMessage[];
  loading: boolean;
  error: Error | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  bottomPadding?: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const initialLoad = useRef(true);

  useEffect(() => {
    if (!initialLoad.current || loading) return;
    initialLoad.current = false;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [loading]);

  if (error) return <div className="flex h-full items-center justify-center text-sm text-destructive">Failed to load messages</div>;

  return (
    <div ref={listRef} className="h-full overflow-y-auto px-4" style={{ paddingBottom: bottomPadding }}>
      <div className="mx-auto w-[90%] py-4">
        {hasOlder && (
          <button type="button" onClick={onLoadOlder} disabled={loadingOlder} className="mb-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
            {loadingOlder ? "Loading older messages…" : "Load older messages"}
          </button>
        )}
        {!hasOlder && messages.length > 0 && <div className="mb-3 text-center text-xs text-muted-foreground">Beginning of session</div>}
        {loading ? <div className="text-sm text-muted-foreground">Loading messages…</div> : messages.map((message) => (
          <div key={message.id} className="pb-3">
            {message.role === "assistant" ? (
              <AssistantText text={message.text} eventId={message.sourceEventId} />
            ) : (
              <UserBubble
                text={message.text}
                timestamp={message.createdAt}
                actorId={message.actor.id}
                actorName={message.actor.name}
                imageKeys={attachmentKeys(message.attachments)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
