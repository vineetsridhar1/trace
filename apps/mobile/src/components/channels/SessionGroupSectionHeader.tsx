import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { useTheme, type Theme } from "@/theme";
import type { SessionGroupSectionStatus } from "@/hooks/useChannelSessionGroups";

const SECTION_LABELS: Record<SessionGroupSectionStatus, string> = {
  needs_input: "Needs Input",
  in_review: "In Review",
  in_progress: "In Progress",
  failed: "Failed",
  stopped: "Stopped",
};

function sectionColor(theme: Theme, status: SessionGroupSectionStatus): string {
  switch (status) {
    case "needs_input":
      return theme.colors.statusNeedsInput;
    case "in_review":
      return theme.colors.statusInReview;
    case "in_progress":
      return theme.colors.statusActive;
    case "failed":
      return theme.colors.statusFailed;
    case "stopped":
      return theme.colors.dimForeground;
  }
}

export interface SessionGroupSectionHeaderProps {
  status: SessionGroupSectionStatus;
  count: number;
  collapsed: boolean;
  onToggle: (status: SessionGroupSectionStatus) => void;
}

export const SessionGroupSectionHeader = memo(function SessionGroupSectionHeader({
  status,
  count,
  collapsed,
  onToggle,
}: SessionGroupSectionHeaderProps) {
  const theme = useTheme();
  const color = sectionColor(theme, status);
  const label = SECTION_LABELS[status];

  const handlePress = useCallback(() => {
    onToggle(status);
  }, [onToggle, status]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "session" : "sessions"}`}
      accessibilityState={{ expanded: !collapsed }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          backgroundColor: pressed
            ? theme.colors.surfaceElevated
            : theme.colors.background,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        variant="footnote"
        style={[styles.label, { color, fontWeight: "600" }]}
      >
        {label}
      </Text>
      <Text variant="caption1" color="dimForeground">
        {count}
      </Text>
      <View style={styles.spacer} />
      <SymbolView
        name={collapsed ? "chevron.right" : "chevron.down"}
        size={11}
        tintColor={theme.colors.dimForeground}
        resizeMode="scaleAspectFit"
        style={styles.chevron}
      />
    </Pressable>
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
  spacer: { flex: 1 },
  chevron: { width: 12, height: 12 },
});
