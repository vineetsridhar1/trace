import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/design-system";
import { useTheme, type Theme } from "@/theme";
import type { HomeSectionKind } from "@/hooks/useHomeSections";

const SECTION_LABELS: Record<HomeSectionKind, string> = {
  needs_input: "Needs you",
  working_now: "Working now",
  recently_done: "Recently done",
};

function sectionColor(theme: Theme, kind: HomeSectionKind): string {
  switch (kind) {
    case "needs_input":
      return theme.colors.statusNeedsInput;
    case "working_now":
      return theme.colors.statusActive;
    case "recently_done":
      return theme.colors.statusDone;
  }
}

export interface HomeSectionHeaderProps {
  kind: HomeSectionKind;
  count: number;
}

export const HomeSectionHeader = memo(function HomeSectionHeader({
  kind,
  count,
}: HomeSectionHeaderProps) {
  const theme = useTheme();
  const color = sectionColor(theme, kind);
  const label = SECTION_LABELS[kind];

  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "session" : "sessions"}`}
      style={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="footnote" style={[styles.label, { color, fontWeight: "600" }]}>
        {label}
      </Text>
      <Text variant="caption1" color="dimForeground">
        {count}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {},
});
