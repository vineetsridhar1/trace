import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

interface PendingInputShellProps {
  header: string;
  headerTrailing?: ReactNode;
  background?: "surface" | "transparent";
  showHeader?: boolean;
  showTopBorder?: boolean;
  keyboardVisible?: boolean;
  children: ReactNode;
}

/**
 * Visual container shared by the question and plan variants of the
 * pending-input bar. Surface background with a top accent border and an
 * accent-tinted uppercase header — matches web's `AskUserQuestionBar` /
 * `PlanResponseBar` chrome so both platforms read the same.
 */
export function PendingInputShell({
  header,
  headerTrailing,
  background = "surface",
  showHeader = true,
  showTopBorder = true,
  keyboardVisible = false,
  children,
}: PendingInputShellProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            background === "transparent" ? "transparent" : theme.colors.surface,
          borderTopColor: alpha(theme.colors.accent, 0.3),
          borderTopWidth: showTopBorder ? StyleSheet.hairlineWidth : 0,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md + (keyboardVisible ? 0 : insets.bottom),
        },
      ]}
    >
      {showHeader ? (
        <View style={styles.headerRow}>
          <Text
            variant="caption2"
            style={[styles.headerLabel, { color: theme.colors.accent }]}
            numberOfLines={1}
          >
            {header}
          </Text>
          {headerTrailing}
        </View>
      ) : null}
      {children}
    </View>
  );
}

interface PendingInputSendButtonProps {
  enabled: boolean;
  loading?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * Compact accent-tinted send button used by both pending-input variants.
 */
export function PendingInputSendButton({
  enabled,
  loading = false,
  accessibilityLabel,
  onPress,
}: PendingInputSendButtonProps) {
  const theme = useTheme();
  const active = enabled && !loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={!active}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sendButton,
        {
          backgroundColor: active
            ? theme.colors.accent
            : alpha(theme.colors.accent, 0.4),
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <SymbolView
        name="paperplane.fill"
        size={14}
        tintColor={theme.colors.accentForeground}
        resizeMode="scaleAspectFit"
        style={styles.sendIcon}
      />
    </Pressable>
  );
}

interface PendingInputPagerButtonProps {
  icon: SFSymbol;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}

/**
 * Chevron pager button used by the question variant when the payload has
 * multiple questions. Single style, narrow surface.
 */
export function PendingInputPagerButton({
  icon,
  accessibilityLabel,
  disabled,
  onPress,
}: PendingInputPagerButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pagerButton,
        {
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceElevated : "transparent",
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <SymbolView
        name={icon}
        size={12}
        tintColor={theme.colors.foreground}
        resizeMode="scaleAspectFit"
        style={styles.pagerIcon}
      />
    </Pressable>
  );
}

export const pendingInputStyles = StyleSheet.create({
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  input: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  container: {},
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerLabel: {
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sendIcon: { width: 14, height: 14 },
  pagerButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerIcon: { width: 12, height: 12 },
});
