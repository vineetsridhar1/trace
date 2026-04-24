import { useMemo } from "react";
import { useTheme } from "@/theme";

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
      placement: "stacked" as const,
      hideNavigationBar: false,
      obscureBackground: false,
      barTintColor: theme.colors.surface,
      textColor: theme.colors.foreground,
      tintColor: theme.colors.foreground,
      onChangeText,
      onCancelButtonPress,
    }),
    [
      hideWhenScrolling,
      onCancelButtonPress,
      onChangeText,
      placeholder,
      theme.colors.foreground,
      theme.colors.surface,
    ],
  );
}
