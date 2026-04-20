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
  dismissOnBackdropTap?: boolean;
  padding?: keyof ThemeSpacing;
  style?: ViewStyle;
}

/**
 * Maps the ticket's semantic detents to fractional heights understood by
 * `react-native-screens`. `small` has no native equivalent on iOS, so it is
 * approximated at ~35% of screen height.
 */
const DETENT_FRACTION: Record<SheetDetent, number> = {
  small: 0.35,
  medium: 0.5,
  large: 1.0,
};

const DEFAULT_DETENTS: SheetDetent[] = ["medium", "large"];

/**
 * Layout primitive for expo-router form-sheet routes. Render this as the root
 * of the route component — it applies the route's sheet-presentation options
 * via `Stack.Screen` and wraps content with consistent padding, a background,
 * and a safe-area-aware bottom inset.
 */
export function Sheet({
  children,
  detents = DEFAULT_DETENTS,
  showGrabber = true,
  dismissOnBackdropTap = true,
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
          presentation: "formSheet",
          sheetAllowedDetents: allowed,
          sheetGrabberVisible: showGrabber,
          sheetCornerRadius: theme.radius.xl,
          gestureEnabled: dismissOnBackdropTap,
          contentStyle: { backgroundColor: theme.colors.surface },
        }}
      />
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.spacing[padding],
            paddingTop: theme.spacing[padding],
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
