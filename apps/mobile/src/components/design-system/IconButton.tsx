import { useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, type Theme } from "@/theme";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconSymbol = keyof typeof Ionicons.glyphMap;
export type HapticStrength = "light" | "medium" | "heavy";

export interface IconButtonProps {
  symbol: IconSymbol;
  onPress: () => void;
  accessibilityLabel: string;
  size?: IconButtonSize;
  color?: keyof Theme["colors"];
  disabled?: boolean;
  haptic?: HapticStrength;
}

const GLYPH_SIZE: Record<IconButtonSize, number> = {
  sm: 18,
  md: 22,
  lg: 28,
};

const HIT_SIZE: Record<IconButtonSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
};

const HAPTIC_MAP: Record<HapticStrength, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export function IconButton({
  symbol,
  onPress,
  accessibilityLabel,
  size = "md",
  color = "foreground",
  disabled = false,
  haptic = "light",
}: IconButtonProps) {
  const theme = useTheme();
  const hitSize = HIT_SIZE[size];

  const handlePress = useCallback(() => {
    if (disabled) return;
    void Haptics.impactAsync(HAPTIC_MAP[haptic]);
    onPress();
  }, [disabled, haptic, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        {
          width: hitSize,
          height: hitSize,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons
        name={symbol}
        size={GLYPH_SIZE[size]}
        color={theme.colors[color]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
