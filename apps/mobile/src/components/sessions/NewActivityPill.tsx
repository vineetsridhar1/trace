import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
export function NewActivityPill({ count, visible, onPress, bottomOffset = 0 }: NewActivityPillProps) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = visible
      ? withSpring(1, theme.motion.springs.smooth)
      : withTiming(0, { duration: theme.motion.durations.fast });
  }, [visible, progress, theme.motion.springs.smooth, theme.motion.durations.fast]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  function handlePress() {
    void haptic.light();
    onPress();
  }

  const label = `${count} new`;

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.wrapper, { bottom: bottomOffset + 8 }, animatedStyle]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Jump to new activity: ${label}`}
        onPress={handlePress}
        hitSlop={8}
      >
        <Glass preset="card" style={styles.pill}>
          <View style={[styles.content, { paddingHorizontal: theme.spacing.md }]}>
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
          </View>
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
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    gap: 6,
  },
  icon: {
    width: 14,
    height: 14,
  },
});
