import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Glass } from "@/components/design-system";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { ACTION_SIZE } from "./constants";

interface SessionComposerSheetTriggerProps {
  label: string;
  accessibilityLabel: string;
  leading: ReactNode;
  disabled: boolean;
  onPress: () => void;
  minWidth?: number;
  showLabel?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SessionComposerSheetTrigger({
  label,
  accessibilityLabel,
  leading,
  disabled,
  onPress,
  minWidth = ACTION_SIZE,
  showLabel = true,
  style,
}: SessionComposerSheetTriggerProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        { minWidth },
        style,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Glass
        preset="input"
        interactive
        style={[
          styles.glass,
          {
            borderColor: theme.colors.borderMuted,
          },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.leading}>{leading}</View>
          {showLabel ? (
            <Text variant="caption1" color="foreground" numberOfLines={1} style={styles.label}>
              {label}
            </Text>
          ) : null}
        </View>
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    height: ACTION_SIZE,
  },
  glass: {
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    minWidth: 0,
    flexShrink: 1,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.78,
  },
});
