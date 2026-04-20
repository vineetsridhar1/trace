import { useEffect } from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme, type Theme } from "@/theme";

export type StatusDotStatus = "active" | "done" | "failed" | "stopped";
export type StatusDotSize = "sm" | "md";

export interface StatusDotProps {
  status: StatusDotStatus;
  size?: StatusDotSize;
  style?: ViewStyle;
}

const DIAMETER: Record<StatusDotSize, number> = { sm: 6, md: 10 };

function statusColor(theme: Theme, status: StatusDotStatus): string {
  switch (status) {
    case "active":
      return theme.colors.statusActive;
    case "done":
      return theme.colors.statusDone;
    case "failed":
      return theme.colors.statusFailed;
    case "stopped":
      return theme.colors.dimForeground;
  }
}

export function StatusDot({ status, size = "md", style }: StatusDotProps) {
  const theme = useTheme();
  const diameter = DIAMETER[size];
  const color = statusColor(theme, status);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (status !== "active") {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.4, {
        duration: 800,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [status, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: color,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
