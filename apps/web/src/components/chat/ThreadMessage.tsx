import { useEntityField } from "../../stores/entity";

export function ThreadMessage({ eventId }: { eventId: string }) {
  const payload = useEntityField("events", eventId, "payload") as Record<string, unknown> | undefined;
  const actor = useEntityField("events", eventId, "actor") as { name?: string } | undefined;
  const timestamp = useEntityField("events", eventId, "timestamp") as string | undefined;

  if (!timestamp) return null;

  const text = typeof payload?.text === "string" ? payload.text : "";
  const actorName = actor?.name ?? "Unknown";
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex gap-3 px-3 py-1.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {actorName[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{actorName}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
      </div>
    </div>
  );
}
