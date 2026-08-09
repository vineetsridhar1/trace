import { StyleSheet, View } from "react-native";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";

export type CreationSectionKind = "needs_input" | "in_progress" | "ready" | "archived";

const LABELS: Record<CreationSectionKind, string> = {
  needs_input: "Needs input",
  in_progress: "In progress",
  ready: "Ready to review",
  archived: "Archived",
};

export function CreationsSectionHeader({ kind, count }: { kind: CreationSectionKind; count: number }) {
  const theme = useTheme();
  const color =
    kind === "needs_input"
      ? theme.colors.warning
      : kind === "in_progress"
        ? "#0a84ff"
        : kind === "ready"
          ? theme.colors.success
          : theme.colors.mutedForeground;

  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <Text variant="footnote" style={{ color, fontWeight: "600" }}>
        {LABELS[kind]}
      </Text>
      <Text variant="caption1" color="dimForeground">{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
