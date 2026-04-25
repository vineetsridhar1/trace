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

/** Shared shell for the pending question/plan bars. */
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
