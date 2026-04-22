import { StyleSheet, View } from "react-native";
import { Text } from "@/components/design-system";
import { timeAgo } from "@/lib/time";
import { useTheme } from "@/theme";
import type { SessionPreviewMessage } from "@/hooks/useSessionPreviewMessage";

export function SessionContextPreview({
  loading,
  message,
  subtitle,
  title,
}: {
  loading: boolean;
  message: SessionPreviewMessage | null;
  subtitle?: string | null;
  title: string;
}) {
  const theme = useTheme();
  const timestamp = message?.timestamp ? timeAgo(message.timestamp) : null;
  const body = message?.text ?? (loading ? "Loading latest message" : "No messages yet");

  return (
    <View
      style={[
        styles.preview,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.xl,
          padding: theme.spacing.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text variant="headline" color="foreground" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              variant="caption1"
              color="dimForeground"
              numberOfLines={1}
              style={styles.subtitle}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {timestamp ? (
          <Text variant="caption2" color="dimForeground" style={styles.timestamp}>
            {timestamp}
          </Text>
        ) : null}
      </View>

      {message?.actorName ? (
        <Text
          variant="caption1"
          color="mutedForeground"
          numberOfLines={1}
          style={[styles.actor, { marginTop: theme.spacing.md }]}
        >
          {message.actorName}
        </Text>
      ) : null}
      <Text
        variant="body"
        color={message?.text ? "foreground" : "mutedForeground"}
        numberOfLines={7}
        style={[
          styles.body,
          {
            marginTop: message?.actorName ? theme.spacing.xs : theme.spacing.md,
          },
        ]}
      >
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: 300,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: { marginTop: 3 },
  timestamp: { marginTop: 2 },
  actor: { fontWeight: "600" },
  body: { lineHeight: 20 },
});
