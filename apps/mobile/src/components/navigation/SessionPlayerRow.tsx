import { memo } from "react";
import { useEntityField } from "@trace/client-core";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { ListRow } from "@/components/design-system";
import { timeAgo } from "@/lib/time";

export const SessionPlayerRow = memo(function SessionPlayerRow({
  sessionId,
  showSeparator,
  onPress,
}: {
  sessionId: string;
  showSeparator: boolean;
  onPress: () => void;
}) {
  const name = useEntityField("sessions", sessionId, "name");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const branch = useEntityField("sessions", sessionId, "branch");
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");
  const ts = lastMessageAt ?? updatedAt;
  const subtitle = [branch, ts ? timeAgo(ts) : null].filter(Boolean).join("  ·  ");

  return (
    <ListRow
      title={name ?? "Session"}
      subtitle={subtitle || undefined}
      leading={
        <SessionStatusIndicator
          status={sessionStatus}
          agentStatus={agentStatus}
          size={10}
        />
      }
      onPress={onPress}
      haptic="selection"
      separator={showSeparator}
    />
  );
});
