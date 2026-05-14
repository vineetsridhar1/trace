import { View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SessionGroupStatus, SessionStatus } from "@trace/gql";
import { TraceLoader } from "@/components/design-system";
import { statusIndicatorColor } from "@/lib/sessionGroupStatus";
import { useTheme } from "@/theme";

export interface SessionStatusIndicatorProps {
  status: SessionGroupStatus | SessionStatus | null | undefined;
  /** Latest session's `agentStatus` — drives the loader/X overlay. */
  agentStatus: string | null | undefined;
  size?: number;
}

type IndicatorKind = "dot" | "loader" | "x";

function indicatorKind(
  status: SessionGroupStatus | SessionStatus | null | undefined,
  agentStatus: string | null | undefined,
): IndicatorKind {
  // Terminal display states force a static dot regardless of agent state —
  // matches web's `getDisplayAgentStatus` which collapses archived/stopped
  // back to a non-spinning indicator.
  if (status === "archived" || status === "stopped" || status === "merged") {
    return "dot";
  }
  if (status === "failed" || agentStatus === "failed") return "x";
  if (agentStatus === "active" || agentStatus === "preparing") return "loader";
  return "dot";
}

export function SessionStatusIndicator({
  status,
  agentStatus,
  size = 10,
}: SessionStatusIndicatorProps) {
  const theme = useTheme();
  const color = statusIndicatorColor(theme, status);
  const kind = indicatorKind(status, agentStatus);

  if (kind === "x") {
    return (
      <SymbolView
        name="xmark.circle.fill"
        size={size + 2}
        tintColor={color}
        resizeMode="scaleAspectFit"
        style={{ width: size + 2, height: size + 2 }}
      />
    );
  }

  if (kind === "loader") {
    return <TraceLoader size={size} color={color} />;
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}
