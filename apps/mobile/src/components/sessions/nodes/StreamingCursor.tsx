import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/theme";

/**
 * Shared blinking cursor used by the mobile typing indicator. Animation runs
 * on the UI thread so it's free of JS-thread jank.
 */
export function StreamingCursor() {
  const theme = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.cursor,
        { backgroundColor: theme.colors.foreground },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  cursor: {
    width: 8,
    height: 16,
    marginLeft: 2,
    marginBottom: -2,
    borderRadius: 1,
  },
});
