import type { ComponentProps } from "react";
import { Pressable } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Glass } from "@/components/design-system";
import { styles } from "./styles";

interface SessionComposerActionButtonProps {
  accessibilityLabel: string;
  disabled: boolean;
  glassStyle?: ComponentProps<typeof Glass>["style"];
  iconName: SFSymbol;
  iconSize: number;
  iconTint: string;
  onPress: () => void;
  tint: string;
}

export function SessionComposerActionButton({
  accessibilityLabel,
  disabled,
  glassStyle,
  iconName,
  iconSize,
  iconTint,
  onPress,
  tint,
}: SessionComposerActionButtonProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(100)}
      style={styles.singleActionSlot}
    >
      <Glass preset="input" tint={tint} interactive style={[styles.singleActionGlass, glassStyle]}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={styles.actionPressable}
        >
          <SymbolView
            name={iconName}
            size={iconSize}
            tintColor={iconTint}
            resizeMode="scaleAspectFit"
            style={{ width: iconSize, height: iconSize }}
          />
        </Pressable>
      </Glass>
    </Animated.View>
  );
}
