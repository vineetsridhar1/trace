import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

interface QuestionOptionPillProps {
  label: string;
  selected: boolean;
  multiSelect: boolean;
  onPress: () => void;
}

/**
 * Single option pill for the question variant of the pending-input bar.
 * Mirrors `apps/web/src/components/session/messages/QuestionOptionPill.tsx`:
 * shows a checkbox glyph for multi-select questions, a radio dot for
 * single-select, and accent-tints the border/text when selected.
 */
export function QuestionOptionPill({
  label,
  selected,
  multiSelect,
  onPress,
}: QuestionOptionPillProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected
            ? alpha(theme.colors.accent, 0.18)
            : pressed
              ? theme.colors.surfaceElevated
              : "transparent",
        },
      ]}
    >
      <View
        style={[
          styles.indicator,
          multiSelect ? styles.indicatorBox : styles.indicatorDot,
          {
            borderColor: selected ? theme.colors.accent : theme.colors.mutedForeground,
            backgroundColor: selected && multiSelect ? theme.colors.accent : "transparent",
          },
        ]}
      >
        {selected && multiSelect ? (
          <SymbolView
            name="checkmark"
            size={9}
            tintColor={theme.colors.accentForeground}
            resizeMode="scaleAspectFit"
            style={styles.checkmark}
          />
        ) : null}
        {selected && !multiSelect ? (
          <View style={[styles.dotFill, { backgroundColor: theme.colors.accent }]} />
        ) : null}
      </View>
      <Text
        variant="footnote"
        style={{
          color: selected ? theme.colors.accent : theme.colors.mutedForeground,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  indicator: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  indicatorBox: { borderRadius: 3 },
  indicatorDot: { borderRadius: 999 },
  dotFill: { width: 6, height: 6, borderRadius: 999 },
  checkmark: { width: 9, height: 9 },
});
