import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useEntityField } from "@trace/client-core";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

export const SessionPlayerSelectedCard = memo(function SessionPlayerSelectedCard({
  sessionId,
}: { sessionId: string }) {
  const theme = useTheme();
  const name = useEntityField("sessions", sessionId, "name");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const branch = useEntityField("sessions", sessionId, "branch");

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: alpha(theme.colors.surfaceElevated, 0.78) },
      ]}
    >
      <SessionStatusIndicator status={sessionStatus} agentStatus={agentStatus} size={12} />
      <View style={styles.text}>
        <Text variant="title2" numberOfLines={2}>
          {name ?? "Session"}
        </Text>
        {branch ? (
          <Text variant="mono" color="mutedForeground" numberOfLines={1}>
            {branch}
          </Text>
        ) : null}
        <Text variant="footnote" color="mutedForeground" style={styles.copy}>
          This expands from the bottom accessory. The full stream screen can stay a
          deeper view.
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    margin: 16,
    padding: 16,
    borderRadius: 20,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  copy: {
    marginTop: 8,
  },
});
