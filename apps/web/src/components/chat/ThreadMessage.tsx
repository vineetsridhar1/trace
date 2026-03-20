import { useEntityField } from "../../stores/entity";
import { MessageContent } from "./MessageContent";
import { UserProfileChatCard } from "../shared/UserProfileChatCard";

interface Actor {
  id?: string;
  name?: string;
  avatarUrl?: string;
}

export function ThreadMessage({ eventId }: { eventId: string }) {
  const payload = useEntityField("events", eventId, "payload") as
    | Record<string, unknown>
    | undefined;
  const actor = useEntityField("events", eventId, "actor") as Actor | undefined;
  const timestamp = useEntityField("events", eventId, "timestamp") as string | undefined;

  if (!timestamp) return null;

  const text = typeof payload?.text === "string" ? payload.text : "";
  const actorName = actor?.name ?? "Unknown";
  const avatarUrl = actor?.avatarUrl;
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const avatarEl = avatarUrl ? (
    <img src={avatarUrl} alt={actorName} className="mt-0.5 h-7 w-7 shrink-0 rounded-md" />
  ) : (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
      {actorName[0]?.toUpperCase()}
    </div>
  );

  return (
    <div className="flex gap-3 px-3 py-1.5">
      {actor?.id ? (
        <UserProfileChatCard
          userId={actor.id}
          fallbackName={actorName}
          fallbackAvatarUrl={avatarUrl}
        >
          {avatarEl}
        </UserProfileChatCard>
      ) : (
        avatarEl
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {actor?.id ? (
            <UserProfileChatCard
              userId={actor.id}
              fallbackName={actorName}
              fallbackAvatarUrl={avatarUrl}
            >
              <span className="cursor-pointer text-sm font-bold text-foreground hover:underline">
                {actorName}
              </span>
            </UserProfileChatCard>
          ) : (
            <span className="text-sm font-bold text-foreground">{actorName}</span>
          )}
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        {typeof payload?.html === "string" ? (
          <MessageContent html={payload.html} />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
        )}
      </div>
    </div>
  );
}
