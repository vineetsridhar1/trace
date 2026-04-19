import { useCallback, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme, type Theme, type TypographyVariant } from "@/theme";
import { Text } from "./Text";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";
export type HapticStrength = "light" | "medium" | "heavy";

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  haptic?: HapticStrength;
  accessibilityLabel?: string;
  fullWidth?: boolean;
}

const PRESSED_SCALE = 0.98;

const DEFAULT_HAPTIC: Record<ButtonVariant, HapticStrength> = {
  primary: "medium",
  secondary: "light",
  ghost: "light",
  destructive: "heavy",
};

interface SizeSpec {
  paddingX: number;
  paddingY: number;
  textVariant: TypographyVariant;
  minHeight: number;
}

const SIZE_SPEC: Record<ButtonSize, SizeSpec> = {
  sm: { paddingX: 12, paddingY: 8, textVariant: "subheadline", minHeight: 32 },
  md: { paddingX: 16, paddingY: 12, textVariant: "callout", minHeight: 44 },
  lg: { paddingX: 20, paddingY: 14, textVariant: "body", minHeight: 52 },
};

const HAPTIC_MAP: Record<HapticStrength, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

interface VariantPalette {
  bg: string;
  fg: keyof Theme["colors"];
}

function variantColors(theme: Theme, variant: ButtonVariant): VariantPalette {
  switch (variant) {
    case "primary":
      return { bg: theme.colors.accent, fg: "accentForeground" };
    case "secondary":
      return { bg: theme.colors.surfaceElevated, fg: "foreground" };
    case "ghost":
      return { bg: "transparent", fg: "foreground" };
    case "destructive":
      return { bg: theme.colors.destructive, fg: "destructiveForeground" };
  }
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  haptic,
  accessibilityLabel,
  fullWidth = false,
}: ButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const palette = useMemo(() => variantColors(theme, variant), [theme, variant]);
  const spec = SIZE_SPEC[size];
  const inactive = disabled || loading;
  const effectiveHaptic = haptic ?? DEFAULT_HAPTIC[variant];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (inactive) return;
    scale.value = withSpring(PRESSED_SCALE, theme.motion.springs.snap);
  }, [inactive, scale, theme.motion.springs.snap]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, theme.motion.springs.snap);
  }, [scale, theme.motion.springs.snap]);

  const handlePress = useCallback(() => {
    if (inactive) return;
    void Haptics.impactAsync(HAPTIC_MAP[effectiveHaptic]);
    onPress?.();
  }, [effectiveHaptic, inactive, onPress]);

  const containerStyle: ViewStyle = {
    backgroundColor: palette.bg,
    paddingHorizontal: spec.paddingX,
    paddingVertical: spec.paddingY,
    minHeight: spec.minHeight,
    borderRadius: theme.radius.full,
    opacity: disabled ? 0.5 : 1,
    alignSelf: fullWidth ? "stretch" : "flex-start",
  };

  const spinnerColor: keyof Theme["colors"] =
    variant === "primary" || variant === "destructive"
      ? "accentForeground"
      : "foreground";

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={[styles.container, containerStyle]}
      >
        {loading ? (
          <Spinner size="small" color={spinnerColor} />
        ) : (
          <>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <Text variant={spec.textVariant} color={palette.fg} align="center">
              {title}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  icon: {
    marginRight: 0,
  },
});
