import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";

interface Actor {
  name?: string;
  avatarUrl?: string;
}

export function ChatMessage({ eventId }: { eventId: string }) {
  const text = useEntityField("events", eventId, "payload") as Record<string, unknown> | undefined;
  const actor = useEntityField("events", eventId, "actor") as Actor | undefined;
  const timestamp = useEntityField("events", eventId, "timestamp") as string | undefined;
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);

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
      </div>
    </div>
  );
}
