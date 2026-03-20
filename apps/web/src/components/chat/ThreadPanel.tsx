import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { client } from "../../lib/urql";
import { useEntityStore, useEntityIds } from "../../stores/entity";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { ThreadMessage } from "./ThreadMessage";
import { ChatComposer } from "./ChatComposer";
import { Button } from "../ui/button";

const THREAD_REPLIES_QUERY = gql`
  query ThreadReplies($rootEventId: ID!, $limit: Int) {
    threadReplies(rootEventId: $rootEventId, limit: $limit) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
        name
        avatarUrl
      }
      parentId
      timestamp
      metadata
    }
  }
`;

export function ThreadPanel({
  chatId,
  rootEventId,
}: {
  chatId: string;
  rootEventId: string;
}) {
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);
  const [loading, setLoading] = useState(true);
  const rootPayload = useEntityField("events", rootEventId, "payload") as Record<string, unknown> | undefined;
  const rootActor = useEntityField("events", rootEventId, "actor") as { name?: string; avatarUrl?: string } | undefined;

  const fetchReplies = useCallback(async () => {
    const result = await client
      .query(THREAD_REPLIES_QUERY, { rootEventId, limit: 200 })
      .toPromise();

    if (result.data?.threadReplies) {
      const events = result.data.threadReplies as Array<Event & { id: string }>;
      useEntityStore.getState().upsertMany("events", events);
    }
    setLoading(false);
  }, [rootEventId]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const replyIds = useEntityIds(
    "events",
    (e) => e.parentId === rootEventId,
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );

  const rootText = typeof rootPayload?.text === "string" ? rootPayload.text : "";
  const rootActorName = rootActor?.name ?? "Unknown";

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
          <img src={rootActor.avatarUrl} alt={rootActorName} className="mt-0.5 h-7 w-7 shrink-0 rounded-md" />
        ) : (
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
            {rootActorName[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold text-foreground">{rootActorName}</span>
          <p className="text-sm text-muted-foreground line-clamp-3">{rootText}</p>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <p className="text-xs text-muted-foreground">Loading replies...</p>
          </div>
        ) : replyIds.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <p className="text-xs text-muted-foreground">No replies yet</p>
          </div>
        ) : (
          replyIds.map((id) => <ThreadMessage key={id} eventId={id} />)
        )}
      </div>

      <ChatComposer chatId={chatId} parentId={rootEventId} />
    </div>
  );
}
