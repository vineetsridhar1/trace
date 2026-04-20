import { memo } from "react";
import { useEntityField } from "@trace/client-core";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { ListRow, Text } from "@/components/design-system";
import { timeAgo } from "@/lib/time";
import { alpha, useTheme } from "@/theme";

export const SessionPlayerRow = memo(function SessionPlayerRow({
  sessionId,
  active,
  onPress,
}: {
  sessionId: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const name = useEntityField("sessions", sessionId, "name");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const branch = useEntityField("sessions", sessionId, "branch");
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");
  const timeLabel = lastMessageAt ?? updatedAt ? timeAgo((lastMessageAt ?? updatedAt) as string) : "";
  const subtitle = [branch, timeLabel].filter(Boolean).join("  •  ");

  return (
    <ListRow
      title={name ?? "Session"}
      subtitle={subtitle}
      leading={
        <SessionStatusIndicator status={sessionStatus} agentStatus={agentStatus} size={10} />
      }
      trailing={active ? <Text variant="caption1" color="accent">Playing</Text> : null}
      onPress={onPress}
      haptic="selection"
      style={active ? { backgroundColor: alpha(theme.colors.accent, 0.12) } : undefined}
      separator={!active}
    />
  );
});
