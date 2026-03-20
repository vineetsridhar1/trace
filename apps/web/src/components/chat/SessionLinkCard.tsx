import { Circle, ExternalLink } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { navigateToSession } from "../../stores/ui";
import {
  statusColor,
  statusLabel,
  getDisplayStatus,
} from "../session/sessionStatus";

interface SessionLinkCardProps {
  sessionId: string;
  channelId: string;
}

export function SessionLinkCard({ sessionId, channelId }: SessionLinkCardProps) {
  const name = useEntityField("sessions", sessionId, "name");
  const rawStatus = useEntityField("sessions", sessionId, "status") as string | undefined;
  const prUrl = useEntityField("sessions", sessionId, "prUrl") as string | null | undefined;

  const displayStatus = getDisplayStatus(rawStatus, prUrl);
  const color = statusColor[displayStatus] ?? "text-muted-foreground";
  const label = statusLabel[displayStatus] ?? displayStatus;

  if (!name) {
    // Session not in store — render a minimal fallback link
    return (
      <a
        href={`/c/${channelId}/s/${sessionId}`}
        onClick={(e) => {
          e.preventDefault();
          navigateToSession(channelId, sessionId);
        }}
        className="inline-flex items-center gap-1.5 text-blue-400 hover:underline cursor-pointer text-sm"
      >
        <ExternalLink size={12} />
        Session
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigateToSession(channelId, sessionId)}
      className="my-1 flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-surface-deep px-3 py-2 text-left transition-colors hover:bg-muted/50 cursor-pointer"
    >
      <Circle size={8} className={`shrink-0 fill-current ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        <div className={`text-xs ${color}`}>{label}</div>
      </div>
      <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
    </button>
  );
}
