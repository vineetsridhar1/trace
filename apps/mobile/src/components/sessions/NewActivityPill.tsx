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
}

/**
 * Floating pill that appears above the session input composer when new events
 * arrive while the user has scrolled up. Tap to jump to the bottom.
 */
export function NewActivityPill({ count, visible, onPress }: NewActivityPillProps) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = visible
      ? withSpring(1, theme.motion.springs.smooth)
      : withTiming(0, { duration: theme.motion.durations.fast });
  }, [visible, progress, theme.motion.springs.smooth, theme.motion.durations.fast]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  function handlePress() {
    void haptic.light();
    onPress();
  }

  const label = `${count} new`;

  return (
    <Animated.View pointerEvents={visible ? "auto" : "none"} style={[styles.wrapper, animatedStyle]}>
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
    right: 16,
    bottom: 0,
    alignItems: "flex-end",
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
