import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";

export function ChatMessage({ eventId }: { eventId: string }) {
  const text = useEntityField("events", eventId, "payload") as Record<string, unknown> | undefined;
  const actor = useEntityField("events", eventId, "actor") as { name?: string } | undefined;
  const timestamp = useEntityField("events", eventId, "timestamp") as string | undefined;
  const setActiveThreadId = useUIStore((s) => s.setActiveThreadId);

  if (!timestamp) return null;

  const messageText = typeof text?.text === "string" ? text.text : "";
  const actorName = actor?.name ?? "Unknown";
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="group flex gap-3 px-4 py-1.5 hover:bg-surface-elevated/30">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {actorName[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{actorName}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground">{messageText}</p>
        <button
          onClick={() => setActiveThreadId(eventId)}
          className="mt-0.5 hidden text-xs text-muted-foreground hover:text-foreground group-hover:inline-flex"
        >
          Reply in thread
        </button>
      </div>
    </div>
  );
}
