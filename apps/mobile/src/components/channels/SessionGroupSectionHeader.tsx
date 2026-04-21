import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { statusIndicatorColor } from "@/lib/sessionGroupStatus";
import type { SessionGroupSectionStatus } from "@/hooks/useChannelSessionGroups";

const SECTION_LABELS: Record<SessionGroupSectionStatus, string> = {
  needs_input: "Needs Input",
  in_review: "In Review",
  in_progress: "In Progress",
  failed: "Failed",
  stopped: "Stopped",
};

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
  const color = statusIndicatorColor(theme, status);
  const label = SECTION_LABELS[status];

  const handlePress = useCallback(() => {
    onToggle(status);
  }, [onToggle, status]);

  // Rotate the chevron between collapsed (right, 0°) and expanded (down, 90°).
  const rotation = useDerivedValue(() =>
    withTiming(collapsed ? 0 : 90, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    }),
  );
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

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
      <Animated.View style={[styles.chevron, chevronStyle]}>
        <SymbolView
          name="chevron.right"
          size={11}
          tintColor={theme.colors.dimForeground}
          resizeMode="scaleAspectFit"
          style={styles.chevron}
        />
      </Animated.View>
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
