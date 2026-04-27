import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

interface NewActivityPillProps {
  count: number;
  visible: boolean;
  onPress: () => void;
  /** Distance from the bottom of the parent to the top of the composer. */
  bottomOffset?: number;
}

/**
 * Floating pill that appears above the session input composer when new events
 * arrive while the user has scrolled up. Tap to jump to the bottom.
 */
export function NewActivityPill({
  count,
  visible,
  onPress,
  bottomOffset = 0,
}: NewActivityPillProps) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = visible
      ? withSpring(1, theme.motion.springs.smooth)
      : withTiming(0, { duration: theme.motion.durations.fast });
  }, [visible, progress, theme.motion.springs.smooth, theme.motion.durations.fast]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 8 }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  function handlePress() {
    void haptic.light();
    onPress();
  }

  const label = `${count} new`;

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.wrapper, { bottom: bottomOffset + 8 }, animatedStyle]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Jump to new activity: ${label}`}
        onPress={handlePress}
        hitSlop={8}
      >
        <Glass
          preset="input"
          style={[styles.pill, { paddingHorizontal: theme.spacing.md }]}
          glassStyleEffect="clear"
        >
          <SymbolView
            name="arrow.down"
            size={14}
            tintColor={theme.colors.foreground}
            resizeMode="scaleAspectFit"
            style={styles.icon}
          />
          <Text variant="footnote" color="foreground">
            {label}
          </Text>
        </Glass>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    alignItems: "flex-start",
  },
  pill: {
    height: 32,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
  },
  icon: {
    width: 14,
    height: 14,
  },
});
