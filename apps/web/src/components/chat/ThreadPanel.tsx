import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { gql } from "@urql/core";
import type { Message } from "@trace/gql";
import { client } from "../../lib/urql";
import {
  messageScopeKey,
  useEntityField,
  useEntityStore,
  useMessageIdsForScope,
} from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { ThreadMessage } from "./ThreadMessage";
import { ChatComposer } from "./ChatComposer";
import { ChannelComposer } from "../channel/ChannelComposer";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";

const THREAD_REPLIES_QUERY = gql`
  query ThreadReplies($rootMessageId: ID!, $limit: Int) {
    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {
      id
      chatId
      channelId
      text
      html
      mentions
      parentMessageId
      replyCount
      latestReplyAt
      threadRepliers {
        type
        id
        name
        avatarUrl
      }
      actor {
        type
        id
        name
        avatarUrl
      }
      createdAt
      updatedAt
      editedAt
      deletedAt
    }
  }
`;

export function ThreadPanel({ chatId, channelId, rootMessageId }: { chatId?: string; channelId?: string; rootMessageId: string }) {
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const rootText = useEntityField("messages", rootMessageId, "text") as string | undefined;
  const rootDeletedAt = useEntityField("messages", rootMessageId, "deletedAt") as
    | string
    | null
    | undefined;
  const rootActor = useEntityField("messages", rootMessageId, "actor") as
    | { name?: string; avatarUrl?: string }
    | undefined;

  const fetchReplies = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await client
        .query(THREAD_REPLIES_QUERY, { rootMessageId, limit: 200 })
        .toPromise();

      if (requestId !== requestIdRef.current) return;

      if (result.error) {
        throw result.error;
      }

      if (result.data?.threadReplies) {
        const messages = result.data.threadReplies as Array<Message & { id: string }>;
        useEntityStore.getState().upsertMany("messages", messages);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load replies");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [rootMessageId]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const scopeKey = chatId
    ? messageScopeKey("chat", chatId)
    : channelId
      ? messageScopeKey("channel", channelId)
      : null;
  const replyIds = useMessageIdsForScope(
    scopeKey ?? "__missing__",
    (message) =>
      message.parentMessageId === rootMessageId &&
      !message.deletedAt,
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );

  const rootActorName = rootActor?.name ?? "Unknown";
  const rootPreview = rootDeletedAt ? "This message has been deleted." : (rootText ?? "");

  return (
    <div className="flex h-full w-full flex-col border-l border-border">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-semibold text-foreground">Thread</span>
        <Button variant="ghost" size="icon" onClick={() => setActiveThreadId(null)}>
          <X size={16} />
        </Button>
      </div>

      {/* Root message preview */}
      <div className="flex gap-3 border-b border-border px-3 py-2">
        {rootActor?.avatarUrl ? (
          <img
            src={rootActor.avatarUrl}
            alt={rootActorName}
            className="mt-0.5 h-7 w-7 shrink-0 rounded-md"
          />
        ) : (
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
            {rootActorName[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold text-foreground">{rootActorName}</span>
          <p className="text-sm text-muted-foreground line-clamp-3">{rootPreview}</p>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="px-4 py-2 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[50%]" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-4">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        ) : replyIds.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <p className="text-xs text-muted-foreground">No replies yet</p>
          </div>
        ) : (
          replyIds.map((id) => <ThreadMessage key={id} messageId={id} />)
        )}
      </div>

      {channelId ? (
        <ChannelComposer channelId={channelId} parentId={rootMessageId} />
      ) : chatId ? (
        <ChatComposer chatId={chatId} parentId={rootMessageId} />
      ) : null}
    </div>
  );
}
