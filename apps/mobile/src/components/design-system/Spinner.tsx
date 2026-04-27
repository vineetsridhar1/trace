import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { useTheme, type Theme } from "@/theme";

export interface SpinnerProps extends Omit<ActivityIndicatorProps, "size" | "color"> {
  size?: "small" | "large";
  color?: keyof Theme["colors"];
}

export function Spinner({ size = "small", color = "foreground", ...rest }: SpinnerProps) {
  const theme = useTheme();
  return <ActivityIndicator size={size} color={theme.colors[color]} {...rest} />;
}
