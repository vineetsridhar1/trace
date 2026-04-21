import { Circle } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import {
  agentStatusColor,
  getDisplayAgentStatus,
  getDisplaySessionStatus,
  sessionStatusLabel,
} from "../session/sessionStatus";
import { SessionPreviewModal } from "./SessionPreviewModal";

interface SessionLinkCardProps {
  sessionId: string;
  channelId: string | null;
  sessionGroupId: string;
}

export function SessionLinkCard({ sessionId, channelId, sessionGroupId }: SessionLinkCardProps) {
  const name = useEntityField("sessions", sessionId, "name");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | string
    | undefined;

  const displayStatus = getDisplaySessionStatus(sessionStatus, null, agentStatus);
  const displayAgentStatus = getDisplayAgentStatus(agentStatus, sessionStatus);
  const color = agentStatusColor[displayAgentStatus] ?? "text-muted-foreground";
  const label = sessionStatusLabel[displayStatus] ?? displayStatus;

  if (!name) {
    return (
      <SessionPreviewModal
        sessionId={sessionId}
        channelId={channelId}
        sessionGroupId={sessionGroupId}
      >
        <span className="inline-flex items-center gap-1.5 text-blue-400 hover:underline cursor-pointer text-sm">
          <ExternalLink size={12} />
          Session
        </span>
      </SessionPreviewModal>
    );
  }

  return (
    <SessionPreviewModal
      sessionId={sessionId}
      channelId={channelId}
      sessionGroupId={sessionGroupId}
    >
      <div className="my-1 flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-surface-deep px-3 py-2 text-left transition-colors hover:bg-muted/50 cursor-pointer">
        <Circle size={8} className={`shrink-0 fill-current ${color}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{name}</div>
          <div className={`text-xs ${color}`}>{label}</div>
        </div>
        <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
      </div>
    </SessionPreviewModal>
  );
}
