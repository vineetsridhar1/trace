import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useEntityField } from "@trace/client-core";
import type { SessionGroupStatus, SessionStatus } from "@trace/gql";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { Text } from "@/components/design-system";
import { statusIndicatorColor } from "@/lib/sessionGroupStatus";
import { timeAgo } from "@/lib/time";
import { alpha, useTheme } from "@/theme";

function statusLabel(
  sessionStatus: SessionGroupStatus | SessionStatus | null | undefined,
  agentStatus: string | null | undefined,
): string {
  if (agentStatus === "active") return "Running";
  if (agentStatus === "failed") return "Failed";
  switch (sessionStatus) {
    case "needs_input":
      return "Needs input";
    case "in_review":
      return "In review";
    case "in_progress":
      return "In progress";
    case "merged":
      return "Merged";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "archived":
      return "Archived";
    default:
      return "Idle";
  }
}

export const SessionPlayerSelectedCard = memo(function SessionPlayerSelectedCard({
  sessionId,
}: { sessionId: string }) {
  const theme = useTheme();
  const name = useEntityField("sessions", sessionId, "name");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const branch = useEntityField("sessions", sessionId, "branch");
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");

  const color = statusIndicatorColor(theme, sessionStatus);
  const timeRaw = lastMessageAt ?? updatedAt;
  const timeLabel = timeRaw ? timeAgo(timeRaw) : null;
  const meta = [branch, timeLabel].filter(Boolean).join("  ·  ");

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.artwork,
          {
            backgroundColor: alpha(color, 0.14),
            borderColor: alpha(color, 0.32),
          },
        ]}
      >
        <SessionStatusIndicator
          status={sessionStatus}
          agentStatus={agentStatus}
          size={44}
        />
        <Text variant="headline" style={styles.artworkLabel}>
          {statusLabel(sessionStatus, agentStatus)}
        </Text>
      </View>

      <Text variant="title2" numberOfLines={2} align="center" style={styles.name}>
        {name ?? "Session"}
      </Text>
      {meta ? (
        <Text
          variant="footnote"
          color="mutedForeground"
          numberOfLines={1}
          align="center"
          style={styles.meta}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 24,
  },
  artworkLabel: {
    fontWeight: "600",
  },
  name: {
    marginBottom: 4,
  },
  meta: {
    marginTop: 2,
  },
});
