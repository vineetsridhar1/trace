import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/theme";

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

const SWEEP_WIDTH = 120;
const SWEEP_DURATION_MS = 1400;

export function Skeleton({ width = "100%", height = 16, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (trackWidth === 0) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: SWEEP_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false,
    );
  }, [trackWidth, progress]);

  const sweepStyle = useAnimatedStyle(() => {
    const travel = trackWidth + SWEEP_WIDTH;
    return {
      transform: [{ translateX: -SWEEP_WIDTH + progress.value * travel }],
    };
  });

  function handleLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  const effectiveRadius = radius ?? theme.radius.sm;

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.track,
        {
          width,
          height,
          borderRadius: effectiveRadius,
          backgroundColor: theme.colors.surfaceElevated,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sweep,
          {
            width: SWEEP_WIDTH,
            backgroundColor: theme.colors.border,
            opacity: 0.6,
          },
          sweepStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden",
  },
  sweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
});
