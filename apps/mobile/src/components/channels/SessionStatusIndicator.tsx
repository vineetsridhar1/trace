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
  // Terminal pipeline states force a static dot regardless of agent state.
  if (status === "archived" || status === "merged") {
    return "dot";
  }
  if (agentStatus === "failed") return "x";
  if (agentStatus === "active" || agentStatus === "preparing") return "loader";
  return "dot";
}

export function SessionStatusIndicator({
  status,
  agentStatus,
  size = 10,
}: SessionStatusIndicatorProps) {
  const theme = useTheme();
  const kind = indicatorKind(status, agentStatus);
  const color =
    kind === "x"
      ? theme.colors.statusFailed
      : kind === "loader" && agentStatus === "preparing"
        ? theme.colors.warning
        : statusIndicatorColor(theme, status);

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
