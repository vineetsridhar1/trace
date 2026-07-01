import { Pressable, StyleSheet } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme, type Theme } from "@/theme";

export interface GlassButtonProps {
  symbol: SFSymbol;
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: keyof Theme["colors"];
}

/**
 * Glass capsule button with an SF Symbol and optional label, matching the
 * pinned-bar glass affordances used across the workspace screens.
 */
export function GlassButton({
  symbol,
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  tint = "foreground",
}: GlassButtonProps) {
  const theme = useTheme();
  return (
    <Glass preset="pinnedBar" glassStyleEffect="clear" interactive style={styles.glass}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={6}
        onPress={() => {
          if (disabled) return;
          void haptic.selection();
          onPress();
        }}
        style={({ pressed }) => [
          styles.inner,
          label ? styles.withLabel : styles.iconOnly,
          { opacity: disabled ? 0.4 : pressed ? 0.72 : 1 },
        ]}
      >
        <SymbolView
          name={symbol}
          size={14}
          tintColor={theme.colors[tint]}
          resizeMode="scaleAspectFit"
          style={styles.glyph}
        />
        {label ? (
          <Text variant="footnote" color={tint}>
            {label}
          </Text>
        ) : null}
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 9999,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
  },
  withLabel: {
    paddingHorizontal: 14,
  },
  iconOnly: {
    width: 40,
  },
  glyph: {
    width: 14,
    height: 14,
  },
});
