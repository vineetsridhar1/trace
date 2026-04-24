import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Glass } from "@/components/design-system";
import { styles } from "./styles";

interface SessionComposerActionButtonProps {
  accessibilityLabel: string;
  contentOpacity?: number;
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
  contentOpacity,
  disabled,
  glassStyle,
  iconName,
  iconSize,
  iconTint,
  onPress,
  tint,
}: SessionComposerActionButtonProps) {
  const resolvedContentOpacity = contentOpacity ?? (disabled ? 0.45 : 1);

  return (
    <View style={styles.singleActionSlot}>
      <Glass preset="input" tint={tint} interactive style={[styles.singleActionGlass, glassStyle]}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [
            styles.actionPressable,
            {
              opacity: disabled
                ? resolvedContentOpacity
                : pressed
                  ? Math.min(resolvedContentOpacity, 0.78)
                  : resolvedContentOpacity,
            },
          ]}
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
    </View>
  );
}
