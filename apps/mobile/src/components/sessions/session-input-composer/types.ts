import type { GlassProps } from "@/components/design-system";
import type { TextStyle, ViewStyle } from "react-native";
import type { AnimatedStyle } from "react-native-reanimated";

export type ComposerGlassAnimatedProps = GlassProps["animatedProps"];
export type ComposerAnimatedTextStyle = AnimatedStyle<TextStyle>;
export type ComposerAnimatedViewStyle = AnimatedStyle<ViewStyle>;
