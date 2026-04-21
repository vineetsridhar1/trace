import { StyleSheet, View } from "react-native";
import type { GitCheckpoint } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";

interface CheckpointMarkerProps {
  checkpoint: GitCheckpoint;
}

/**
 * Inline chip rendered below user prompts that produced a git commit. Tap is
 * a no-op in V1 — the full file-tree view ships in a later milestone.
 */
export function CheckpointMarker({ checkpoint }: CheckpointMarkerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: "rgba(38,38,38,0.4)",
          borderColor: "rgba(255,255,255,0.05)",
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.sm,
          gap: theme.spacing.xs,
        },
      ]}
    >
      <SymbolView
        name="circle"
        size={12}
        tintColor={theme.colors.mutedForeground}
        resizeMode="scaleAspectFit"
        style={styles.icon}
      />
      <Text
        variant="caption2"
        style={{ color: theme.colors.foreground, fontFamily: "Menlo", fontWeight: "600" }}
      >
        {shortSha(checkpoint.commitSha)}
      </Text>
      <Text variant="caption1" color="mutedForeground" numberOfLines={1} style={styles.subject}>
        {checkpoint.subject}
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
    maxWidth: 220,
  },
  icon: { width: 12, height: 12 },
  subject: { flexShrink: 1, maxWidth: 130 },
});
