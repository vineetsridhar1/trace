import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Glass } from "@/components/design-system/Glass";
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

const HEIGHT = 40;

export function TopBarPill({ actions = [], avatar }: TopBarPillProps) {
  const theme = useTheme();

  function press(fn: () => void) {
    void haptic.selection();
    fn();
  }

  return (
    <Glass preset="tabBar" style={styles.pill}>
      <View style={styles.row}>
        {actions.map((a, i) => (
          <View key={a.id} style={styles.slotWrap}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: theme.colors.borderMuted }]} />}
            <Pressable
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
          </View>
        ))}
        {avatar && (
          <View style={styles.slotWrap}>
            {actions.length > 0 && (
              <View style={[styles.divider, { backgroundColor: theme.colors.borderMuted }]} />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={avatar.accessibilityLabel}
              onPress={() => press(avatar.onPress)}
              style={({ pressed }) => [styles.avatarSlot, pressed && { opacity: 0.7 }]}
              hitSlop={6}
            >
              <Avatar name={avatar.name} uri={avatar.uri} size="sm" />
            </Pressable>
          </View>
        )}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: HEIGHT,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  slotWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  slot: {
    width: HEIGHT,
    height: HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSlot: {
    width: HEIGHT,
    height: HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    alignSelf: "center",
    opacity: 0.5,
  },
});
