import { useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import { Glass } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface FloatingBackButtonProps {
  onPress: () => void;
}

/** Reusable liquid-glass back affordance for immersive routed screens. */
export function FloatingBackButton({ onPress }: FloatingBackButtonProps) {
  const theme = useTheme();
  const handlePress = useCallback(() => {
    void haptic.light();
    onPress();
  }, [onPress]);

  return (
    <Glass
      preset="input"
      interactive
      style={[styles.glass, { borderColor: alpha(theme.colors.foreground, 0.14) }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={handlePress}
        style={styles.button}
      >
        <SymbolView
          name="chevron.left"
          size={18}
          tintColor={theme.colors.foreground}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    overflow: "hidden",
    width: 48,
  },
  button: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
