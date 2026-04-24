import { useMemo } from "react";
import { useTheme } from "@/theme";

export function useNativeStackScreenOptions() {
  const theme = useTheme();

  return useMemo(
    () => ({
      headerStyle: {
        backgroundColor: theme.colors.surface,
      },
      headerLargeStyle: {
        backgroundColor: theme.colors.background,
      },
      headerTintColor: theme.colors.foreground,
      headerTitleStyle: {
        color: theme.colors.foreground,
      },
      headerLargeTitleStyle: {
        color: theme.colors.foreground,
      },
      headerShadowVisible: false,
      headerLargeTitleShadowVisible: false,
      contentStyle: {
        backgroundColor: theme.colors.background,
      },
    }),
    [theme],
  );
}

export function useHeaderSearchBarOptions({
  placeholder,
  hideWhenScrolling,
  onChangeText,
  onCancelButtonPress,
}: {
  placeholder: string;
  hideWhenScrolling: boolean;
  onChangeText: (e: { nativeEvent: { text: string } }) => void;
  onCancelButtonPress: () => void;
}) {
  const theme = useTheme();

  return useMemo(
    () => ({
      placeholder,
      hideWhenScrolling,
      barTintColor: theme.colors.surfaceElevated,
      textColor: theme.colors.foreground,
      hintTextColor: theme.colors.mutedForeground,
      tintColor: theme.colors.foreground,
      headerIconColor: theme.colors.foreground,
      onChangeText,
      onCancelButtonPress,
    }),
    [
      hideWhenScrolling,
      onCancelButtonPress,
      onChangeText,
      placeholder,
      theme.colors.foreground,
      theme.colors.mutedForeground,
      theme.colors.surfaceElevated,
    ],
  );
}
