import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  useTheme,
  type ShadowLevel,
  type Theme,
  type ThemeSpacing,
} from "@/theme";
import { Glass } from "./Glass";

export type CardElevation = "low" | "medium" | "high";
export type CardHaptic = "light" | "medium" | "heavy";

export interface CardProps {
  children: ReactNode;
  elevation?: CardElevation;
  padding?: keyof ThemeSpacing;
  glass?: boolean;
  onPress?: () => void;
  haptic?: CardHaptic;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

const ELEVATION_SHADOW: Record<CardElevation, ShadowLevel> = {
  low: "sm",
  medium: "md",
  high: "lg",
};

const HAPTIC_MAP: Record<CardHaptic, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

const PRESSED_SCALE = 0.98;

interface CardSurfaceProps {
  children: ReactNode;
  containerStyle: ViewStyle;
  glass: boolean;
  theme: Theme;
}

function CardSurface({ children, containerStyle, glass, theme }: CardSurfaceProps) {
  if (glass) {
    return (
      <Glass preset="card" style={containerStyle}>
        {children}
      </Glass>
    );
  }
  return (
    <View
      style={[
        containerStyle,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function Card({
  children,
  elevation = "medium",
  padding = "lg",
  glass = false,
  onPress,
  haptic = "light",
  accessibilityLabel,
  style,
}: CardProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const shadow = theme.shadows[ELEVATION_SHADOW[elevation]];
  const containerStyle: ViewStyle = {
    padding: theme.spacing[padding],
    ...shadow,
    ...style,
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!onPress) {
    return (
      <CardSurface containerStyle={containerStyle} glass={glass} theme={theme}>
        {children}
      </CardSurface>
    );
  }

  function handlePressIn() {
    scale.value = withSpring(PRESSED_SCALE, theme.motion.springs.snap);
  }

  function handlePressOut() {
    scale.value = withSpring(1, theme.motion.springs.snap);
  }

  function handlePress() {
    void Haptics.impactAsync(HAPTIC_MAP[haptic]);
    onPress?.();
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        <CardSurface
          containerStyle={containerStyle}
          glass={glass}
          theme={theme}
        >
          {children}
        </CardSurface>
      </Pressable>
    </Animated.View>
  );
}
