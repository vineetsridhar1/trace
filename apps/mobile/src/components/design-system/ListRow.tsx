import { useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { haptic as hapticFeedback } from "@/lib/haptics";
import { alpha, useTheme, type Theme } from "@/theme";
import { Text } from "./Text";

export type ListRowHaptic = "light" | "selection" | "none";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  destructive?: boolean;
  disclosureIndicator?: boolean;
  separator?: boolean;
  haptic?: ListRowHaptic;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  onLongPress,
  destructive = false,
  disclosureIndicator = false,
  separator = true,
  haptic = "light",
  accessibilityLabel,
  style,
}: ListRowProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const titleColor: keyof Theme["colors"] = destructive
    ? "destructive"
    : "foreground";
  const feedbackColor = alpha(
    destructive ? theme.colors.destructive : theme.colors.accent,
    0.14,
  );

  function handlePress(e: GestureResponderEvent) {
    if (haptic === "light") void hapticFeedback.light();
    if (haptic === "selection") void hapticFeedback.selection();
    onPress?.(e);
  }

  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.center}>
        <Text variant="body" color={titleColor} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="footnote"
            color="mutedForeground"
            numberOfLines={1}
            style={styles.subtitle}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {disclosureIndicator ? (
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={theme.colors.dimForeground}
          style={styles.chevron}
        />
      ) : null}
    </>
  );

  const containerStyle: ViewStyle = {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: separator ? StyleSheet.hairlineWidth : 0,
    borderBottomColor: theme.colors.border,
  };

  if (!onPress && !onLongPress) {
    return (
      <View style={[styles.row, containerStyle, style]}>{content}</View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={handlePress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        containerStyle,
        (pressed || hovered) && { backgroundColor: feedbackColor },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },
  leading: {
    marginRight: 12,
  },
  center: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 2,
  },
  trailing: {
    marginLeft: 12,
  },
  chevron: {
    marginLeft: 8,
  },
});
