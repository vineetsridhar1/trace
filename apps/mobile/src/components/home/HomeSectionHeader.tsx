import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Glass, Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import type { HomeSectionKind } from "@/hooks/useHomeSections";

const SECTION_LABELS: Record<HomeSectionKind, string> = {
  needs_input: "Needs you",
  working_now: "Working now",
  recently_done: "Recently done",
};

export interface HomeSectionHeaderProps {
  kind: HomeSectionKind;
  count: number;
}

export const HomeSectionHeader = memo(function HomeSectionHeader({
  kind,
  count,
}: HomeSectionHeaderProps) {
  const theme = useTheme();
  const label = SECTION_LABELS[kind];

  return (
    <Glass
      preset="pinnedBar"
      style={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
        },
      ]}
    >
      <Text
        variant="footnote"
        color="foreground"
        style={styles.label}
      >
        {label}
      </Text>
      <View style={styles.spacer} />
      <Text variant="caption1" color="dimForeground">
        {count}
      </Text>
    </Glass>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  label: { fontWeight: "600" },
  spacer: { flex: 1 },
});
