import { useMemo, useRef } from "react";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";

interface Actor {
  name?: string;
  avatarUrl?: string;
}

interface ThreadMeta {
  count: number;
  latestTimestamp: string;
  replierAvatars: Array<{ name?: string; avatarUrl?: string }>;
}

/** Derive thread reply metadata from the event store using a serialized key for stability */
function useThreadReplies(rootEventId: string): ThreadMeta {
  const serialized = useEntityStore((state) => {
    const events = state.events;
    let count = 0;
    let latestTimestamp = "";
    const seenActors = new Map<string, { name?: string; avatarUrl?: string }>();

    for (const event of Object.values(events)) {
      if (event.parentId !== rootEventId) continue;
      count++;
      const actor = event.actor as Actor & { id?: string };
      if (actor?.id) {
        seenActors.set(actor.id, { name: actor.name, avatarUrl: actor.avatarUrl });
      }
      if (event.timestamp > latestTimestamp) {
        latestTimestamp = event.timestamp;
      }
    }

    if (count === 0) return "";

    const avatars = Array.from(seenActors.values()).slice(0, 3);
    return JSON.stringify({ count, latestTimestamp, avatars });
  });

  const prevRef = useRef<{ key: string; value: ThreadMeta }>({
    key: "",
    value: { count: 0, latestTimestamp: "", replierAvatars: [] },
  });

  return useMemo(() => {
    if (serialized === prevRef.current.key) return prevRef.current.value;

    if (!serialized) {
      const empty: ThreadMeta = { count: 0, latestTimestamp: "", replierAvatars: [] };
      prevRef.current = { key: "", value: empty };
      return empty;
    }

    const parsed = JSON.parse(serialized) as { count: number; latestTimestamp: string; avatars: Array<{ name?: string; avatarUrl?: string }> };
    const value: ThreadMeta = {
      count: parsed.count,
      latestTimestamp: parsed.latestTimestamp,
      replierAvatars: parsed.avatars,
    };
    prevRef.current = { key: serialized, value };
    return value;
  }, [serialized]);
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatMessage({ eventId }: { eventId: string }) {
  const text = useEntityField("events", eventId, "payload") as Record<string, unknown> | undefined;
  const actor = useEntityField("events", eventId, "actor") as Actor | undefined;
  const timestamp = useEntityField("events", eventId, "timestamp") as string | undefined;
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);
  const { count: replyCount, latestTimestamp, replierAvatars } = useThreadReplies(eventId);

  if (!timestamp) return null;

  const messageText = typeof text?.text === "string" ? text.text : "";
  const actorName = actor?.name ?? "Unknown";
  const avatarUrl = actor?.avatarUrl;
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="group relative flex gap-3 px-5 py-1.5 hover:bg-surface-elevated/30">
      <div className="absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-surface-elevated shadow-sm group-hover:inline-flex">
        <button
          onClick={() => setActiveThreadId(eventId)}
          className="cursor-pointer rounded-l-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Reply in thread"
        >
          <MessageSquare size={15} />
        </button>
        <button
          className="cursor-pointer p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Edit message"
        >
          <Pencil size={15} />
        </button>
        <button
          className="cursor-pointer rounded-r-md p-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-500"
          title="Delete message"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={actorName}
          className="mt-0.5 h-9 w-9 shrink-0 rounded-lg"
        />
      ) : (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
          {actorName[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold text-foreground leading-snug">{actorName}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{messageText}</p>
        {replyCount > 0 && (
          <button
            onClick={() => setActiveThreadId(eventId)}
            className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 hover:bg-surface-elevated/50"
          >
            <div className="flex -space-x-1.5">
              {replierAvatars.map((replier, i) =>
                replier.avatarUrl ? (
                  <img
                    key={i}
                    src={replier.avatarUrl}
                    alt={replier.name ?? ""}
                    className="h-6 w-6 rounded-md border-2 border-background"
                  />
                ) : (
                  <div
                    key={i}
                    className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground"
                  >
                    {replier.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                ),
              )}
            </div>
            <span className="text-[13px] font-bold text-blue-400 hover:underline">
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(latestTimestamp)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
