import { Pressable, StyleSheet, type NativeSyntheticEvent } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import * as Haptics from "expo-haptics";
import { useTheme, type Theme } from "@/theme";

export type IconButtonSize = "sm" | "md" | "lg";
export type HapticStrength = "light" | "medium" | "heavy";

export interface IconMenuItem {
  title: string;
  systemIcon?: SFSymbol;
  destructive?: boolean;
  onPress: () => void;
}

export interface IconButtonProps {
  symbol: SFSymbol;
  onPress: () => void;
  accessibilityLabel: string;
  size?: IconButtonSize;
  color?: keyof Theme["colors"];
  disabled?: boolean;
  haptic?: HapticStrength;
  menuItems?: IconMenuItem[];
}

const GLYPH_SIZE: Record<IconButtonSize, number> = { sm: 18, md: 22, lg: 28 };
const HIT_SIZE: Record<IconButtonSize, number> = { sm: 32, md: 40, lg: 48 };

const HAPTIC_MAP: Record<HapticStrength, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export function IconButton({
  symbol,
  onPress,
  accessibilityLabel,
  size = "md",
  color = "foreground",
  disabled = false,
  haptic = "light",
  menuItems,
}: IconButtonProps) {
  const theme = useTheme();
  const hitSize = HIT_SIZE[size];

  function handlePress() {
    if (disabled) return;
    void Haptics.impactAsync(HAPTIC_MAP[haptic]);
    onPress();
  }

  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        {
          width: hitSize,
          height: hitSize,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <SymbolView
        name={symbol}
        size={GLYPH_SIZE[size]}
        tintColor={theme.colors[color]}
      />
    </Pressable>
  );

  if (!menuItems || menuItems.length === 0) return button;

  const actions: ContextMenuAction[] = menuItems.map((m) => ({
    title: m.title,
    systemIcon: m.systemIcon,
    destructive: m.destructive,
  }));

  function handleMenuPress(
    e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>,
  ) {
    menuItems?.[e.nativeEvent.index]?.onPress();
  }

  return (
    <ContextMenu actions={actions} onPress={handleMenuPress}>
      {button}
    </ContextMenu>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
