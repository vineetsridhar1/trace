import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Avatar } from "@/components/design-system/Avatar";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

export interface TopBarPillAction {
  id: string;
  accessibilityLabel: string;
  symbol: SFSymbol;
  onPress: () => void;
}

export interface TopBarPillAvatar {
  name: string;
  uri?: string | null;
  accessibilityLabel: string;
  onPress: () => void;
}

export interface TopBarPillProps {
  actions?: TopBarPillAction[];
  avatar?: TopBarPillAvatar;
}

const SIZE = 36;

export function TopBarPill({ actions = [], avatar }: TopBarPillProps) {
  const theme = useTheme();

  function press(fn: () => void) {
    void haptic.selection();
    fn();
  }

  return (
    <View style={styles.row}>
      {actions.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={a.accessibilityLabel}
          onPress={() => press(a.onPress)}
          style={({ pressed }) => [styles.slot, pressed && { opacity: 0.6 }]}
          hitSlop={6}
        >
          <SymbolView
            name={a.symbol}
            size={18}
            tintColor={theme.colors.foreground}
            weight="medium"
          />
        </Pressable>
      ))}
      {avatar && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={avatar.accessibilityLabel}
          onPress={() => press(avatar.onPress)}
          style={({ pressed }) => [styles.slot, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Avatar name={avatar.name} uri={avatar.uri} size="sm" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slot: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
