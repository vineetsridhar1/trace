import { Platform, type TextStyle } from "react-native";

/**
 * Typography variants follow Apple's iOS text styles. Values are fontSize /
 * lineHeight pairs in points. `fontFamily` is omitted so React Native uses the
 * system default (`.AppleSystemUIFont` on iOS, Roboto on Android fallback).
 */
export type TypographyVariant =
  | "largeTitle"
  | "title1"
  | "title2"
  | "headline"
  | "body"
  | "callout"
  | "subheadline"
  | "footnote"
  | "caption1"
  | "caption2"
  | "mono";

export type ThemeTypography = Record<TypographyVariant, TextStyle>;

const monoFamily = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const typography: ThemeTypography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400" },
  mono: { fontSize: 16, lineHeight: 21, fontFamily: monoFamily },
};
