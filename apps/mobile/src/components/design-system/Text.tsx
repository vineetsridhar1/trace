import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme, type Theme, type TypographyVariant } from "@/theme";

export interface TextProps extends Omit<RNTextProps, "style"> {
  variant?: TypographyVariant;
  color?: keyof Theme["colors"];
  align?: "left" | "center" | "right";
  style?: RNTextProps["style"];
}

export function Text({
  variant = "body",
  color = "foreground",
  align,
  allowFontScaling = true,
  style,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      allowFontScaling={allowFontScaling}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
