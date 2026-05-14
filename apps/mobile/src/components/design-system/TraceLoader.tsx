import { useEffect } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { alpha, useTheme, type Theme } from "@/theme";

export interface TraceLoaderProps extends ViewProps {
  size?: "small" | "large";
  color?: keyof Theme["colors"];
  animating?: boolean;
  hidesWhenStopped?: boolean;
}

const GRID_SIZE = 3;
const PATH_LENGTH = 16;
const SIZE_PX: Record<NonNullable<TraceLoaderProps["size"]>, number> = {
  small: 22,
  large: 38,
};
const SNAKE_PATH = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [2, 1],
  [2, 0],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 1],
] as const;

const dots = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
  id: `${index % GRID_SIZE}:${Math.floor(index / GRID_SIZE)}`,
  x: index % GRID_SIZE,
  y: Math.floor(index / GRID_SIZE),
}));

const snakeLights = SNAKE_PATH.map(([x, y], index) => ({
  id: `${x}:${y}:${index}`,
  x,
  y,
  snakeIndex: index,
}));

export function TraceLoader({
  size = "small",
  color = "foreground",
  animating = true,
  hidesWhenStopped = true,
  style,
  ...rest
}: TraceLoaderProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const dimension = SIZE_PX[size];
  const dotSize = dimension * 0.25;
  const lightSize = dimension * 0.28;
  const spacing = (dimension - dotSize) / 2;
  const baseColor = alpha(theme.colors[color], 0.24);
  const activeColor = theme.colors[color];
  const shouldAnimate = animating && !reducedMotion;

  useEffect(() => {
    if (!shouldAnimate) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = withRepeat(
      withTiming(PATH_LENGTH, {
        duration: 1280,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(progress);
    };
  }, [progress, shouldAnimate]);

  if (!animating && hidesWhenStopped) return null;

  return (
    <View
      accessibilityRole="progressbar"
      style={[styles.container, { width: dimension, height: dimension }, style]}
      {...rest}
    >
      {dots.map((dot) => (
        <View
          key={dot.id}
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: baseColor,
              left: dot.x * spacing,
              top: dot.y * spacing,
            },
          ]}
        />
      ))}
      {snakeLights.map((dot) => (
        <SnakeLight
          key={dot.id}
          activeColor={activeColor}
          dotSize={lightSize}
          progress={progress}
          snakeIndex={dot.snakeIndex}
          x={dot.x * spacing - (lightSize - dotSize) / 2}
          y={dot.y * spacing - (lightSize - dotSize) / 2}
        />
      ))}
    </View>
  );
}

function SnakeLight({
  activeColor,
  dotSize,
  progress,
  snakeIndex,
  x,
  y,
}: {
  activeColor: string;
  dotSize: number;
  progress: SharedValue<number>;
  snakeIndex: number;
  x: number;
  y: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const phase = (progress.value - snakeIndex + PATH_LENGTH) % PATH_LENGTH;
    const opacity =
      phase < 1
        ? phase
        : phase < 3.84
          ? 1
          : phase < 5.44
            ? 1 - (phase - 3.84) / 1.6
            : 0;
    const scale = 0.84 + opacity * 0.38;

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.light,
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: activeColor,
          left: x,
          top: y,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  dot: {
    position: "absolute",
  },
  light: {
    position: "absolute",
  },
});
