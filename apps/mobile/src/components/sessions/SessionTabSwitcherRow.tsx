import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import type { SessionStatus } from "@trace/gql";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { ListRow } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

interface SessionTabSwitcherRowProps {
  sessionId: string;
  active: boolean;
  separator: boolean;
  onPress: () => void;
}

export function SessionTabSwitcherRow({
  sessionId,
  active,
  separator,
  onPress,
}: SessionTabSwitcherRowProps) {
  const theme = useTheme();
  const name = useEntityField("sessions", sessionId, "name") as string | null | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | SessionStatus
    | null
    | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as
    | string
    | null
    | undefined;

  return (
    <ListRow
      title={name ?? "Session"}
      subtitle={sessionSubtitle(active, sessionStatus, agentStatus)}
      leading={
        <SessionStatusIndicator status={sessionStatus} agentStatus={agentStatus} size={10} />
      }
      trailing={
        active ? (
          <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
        ) : undefined
      }
      onPress={onPress}
      haptic={active ? "none" : "selection"}
      separator={separator}
      accessibilityLabel={
        active ? `${name ?? "Session"}, current tab` : `Switch to ${name ?? "session"}`
      }
      style={active ? { backgroundColor: alpha(theme.colors.accent, 0.12) } : undefined}
    />
  );
}

function sessionSubtitle(
  active: boolean,
  sessionStatus: SessionStatus | null | undefined,
  agentStatus: string | null | undefined,
): string | undefined {
  if (active) return "Current tab";
  if (agentStatus === "active") return "Agent running";
  if (agentStatus === "failed") return "Needs attention";
  if (sessionStatus === "needs_input") return "Needs input";
  if (sessionStatus === "in_review") return "In review";
  if (sessionStatus === "merged") return "Merged";
  return "Idle";
}
