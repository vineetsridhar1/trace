import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useTheme, type ThemeSpacing } from "@/theme";

export type SheetDetent = "small" | "medium" | "large";

export interface SheetProps {
  children: ReactNode;
  detents?: SheetDetent[];
  showGrabber?: boolean;
  /**
   * Enables the native swipe-down gesture to dismiss. iOS backdrop-tap
   * dismissal is always on for dimmed detents and is not toggleable here.
   */
  swipeToDismiss?: boolean;
  padding?: keyof ThemeSpacing;
  style?: ViewStyle;
}

/**
 * Maps the plan's semantic detents to fractional heights understood by
 * `react-native-screens`. `small` has no native iOS equivalent so it is
 * approximated at ~35% of screen height.
 */
const DETENT_FRACTION: Record<SheetDetent, number> = {
  small: 0.35,
  medium: 0.5,
  large: 1.0,
};

const DEFAULT_DETENTS: SheetDetent[] = ["medium", "large"];

/**
 * Layout primitive for expo-router form-sheet routes. The parent layout must
 * register the route with `presentation: 'formSheet'` — that option must be
 * declared at route-tree registration time and cannot be set dynamically from
 * inside the screen body (expo-router's inline `Stack.Screen` calls
 * `setOptions` after mount, which is too late for `presentation`).
 *
 * This primitive dynamically configures the sheet's allowed detents, grabber
 * visibility, corner radius, and swipe-to-dismiss, and wraps content with the
 * theme surface color + safe-area-aware bottom inset.
 */
export function Sheet({
  children,
  detents = DEFAULT_DETENTS,
  showGrabber = true,
  swipeToDismiss = true,
  padding = "lg",
  style,
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const allowed = detents.map((d) => DETENT_FRACTION[d]);

  return (
    <>
      <Stack.Screen
        options={{
          sheetAllowedDetents: allowed,
          sheetGrabberVisible: showGrabber,
          sheetCornerRadius: theme.radius.xl,
          gestureEnabled: swipeToDismiss,
        }}
      />
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.spacing[padding],
            paddingTop: insets.top + theme.spacing[padding],
            paddingBottom: insets.bottom + theme.spacing[padding],
          },
          style,
        ]}
      >
        {children}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
