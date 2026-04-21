import { StyleSheet, View } from "react-native";
import type { GitCheckpoint } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

interface CheckpointMarkerProps {
  checkpoint: GitCheckpoint;
}

/**
 * Inline chip rendered below user prompts that produced a git commit. Tap is
 * a no-op in V1 — the full file-tree view ships in a later milestone.
 */
export function CheckpointMarker({ checkpoint }: CheckpointMarkerProps) {
  const theme = useTheme();
  const count = checkpoint.filesChanged ?? 0;
  const suffix = count === 1 ? "file" : "files";

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: alpha(theme.colors.statusDone, 0.12),
          borderColor: alpha(theme.colors.statusDone, 0.3),
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.md,
          gap: theme.spacing.xs,
        },
      ]}
    >
      <SymbolView
        name="checkmark.circle.fill"
        size={12}
        tintColor={theme.colors.statusDone}
        resizeMode="scaleAspectFit"
        style={styles.icon}
      />
      <Text variant="caption1" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
        Committed
      </Text>
      <Text variant="caption1" color="mutedForeground" numberOfLines={1} style={styles.subject}>
        {checkpoint.subject}
      </Text>
      <Text
        variant="caption2"
        color="dimForeground"
        style={{ fontFamily: "Menlo" }}
      >
        {shortSha(checkpoint.commitSha)}
      </Text>
      <Text variant="caption2" color="dimForeground">
        · {count} {suffix}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
  },
  icon: { width: 12, height: 12 },
  subject: { flexShrink: 1, maxWidth: 140 },
});
