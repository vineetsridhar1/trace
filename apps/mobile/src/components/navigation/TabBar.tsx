import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SFSymbol } from "expo-symbols";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Glass } from "@/components/design-system/Glass";
import { Text } from "@/components/design-system/Text";
import { haptic } from "@/lib/haptics";
import { useTheme, type Theme } from "@/theme";

export interface TabDef {
  name: string;
  label: string;
  symbol: SFSymbol;
  badge?: number;
}

export interface TabBarProps extends BottomTabBarProps {
  tabs: TabDef[];
}

const ACTIVE_GLYPH = 24;
const INACTIVE_GLYPH = 22;

export function TabBar({ state, navigation, tabs }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Glass
      preset="tabBar"
      style={{
        ...styles.container,
        paddingBottom: insets.bottom,
        borderTopColor: theme.colors.borderMuted,
      }}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const def = tabs.find((t) => t.name === route.name);
          if (!def) return null;

          const isFocused = state.index === index;

          function onPress() {
            void haptic.selection();
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          }

          return (
            <TabBarItem
              key={route.key}
              label={def.label}
              symbol={def.symbol}
              badge={def.badge ?? 0}
              focused={isFocused}
              onPress={onPress}
              theme={theme}
            />
          );
        })}
      </View>
    </Glass>
  );
}

interface TabBarItemProps {
  label: string;
  symbol: SFSymbol;
  badge: number;
  focused: boolean;
  onPress: () => void;
  theme: Theme;
}

function TabBarItem({ label, symbol, badge, focused, onPress, theme }: TabBarItemProps) {
  const tint = focused ? theme.colors.accent : theme.colors.mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.iconWrap}>
        <SymbolView
          name={symbol}
          size={focused ? ACTIVE_GLYPH : INACTIVE_GLYPH}
          tintColor={tint}
          weight={focused ? "semibold" : "regular"}
        />
        {badge > 0 && (
          <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
            <Text
              variant="caption2"
              style={{ color: theme.colors.accentForeground, fontSize: 11, lineHeight: 14 }}
            >
              {badge > 99 ? "99+" : String(badge)}
            </Text>
          </View>
        )}
      </View>
      <Text
        variant="caption2"
        style={{ color: tint, fontSize: 10, marginTop: 2 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    paddingTop: 6,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
