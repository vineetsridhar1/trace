import { useMemo } from "react";
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
  onSearch?: () => void;
}

const PILL_HEIGHT = 64;
const GLYPH = 22;

export function TabBar({ state, navigation, tabs, onSearch }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabsByName = useMemo(() => {
    const map: Record<string, TabDef> = {};
    for (const t of tabs) map[t.name] = t;
    return map;
  }, [tabs]);

  function handleSearch() {
    void haptic.selection();
    onSearch?.();
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: insets.bottom + 8 }]}
    >
      <View style={styles.row}>
        <Glass preset="tabBar" style={styles.mainPill}>
          <View style={styles.items}>
            {state.routes.map((route, index) => {
              const def = tabsByName[route.name];
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

        <Glass preset="tabBar" style={styles.searchPill}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={handleSearch}
            style={({ pressed }) => [
              styles.searchItem,
              pressed && { opacity: 0.6 },
            ]}
          >
            <SymbolView
              name="magnifyingglass"
              size={GLYPH}
              tintColor={theme.colors.foreground}
              weight="medium"
            />
          </Pressable>
        </Glass>
      </View>
    </View>
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
      style={({ pressed }) => [
        styles.item,
        focused && {
          backgroundColor: theme.colors.accentMuted,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.iconWrap}>
        <SymbolView
          name={symbol}
          size={GLYPH}
          tintColor={tint}
          weight={focused ? "semibold" : "regular"}
        />
        {badge > 0 && (
          <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
            <Text
              variant="caption2"
              style={{ color: theme.colors.accentForeground, fontSize: 10, lineHeight: 12 }}
            >
              {badge > 99 ? "99+" : String(badge)}
            </Text>
          </View>
        )}
      </View>
      <Text
        variant="caption2"
        style={{ color: tint, fontSize: 10, marginTop: 2, fontWeight: focused ? "600" : "400" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mainPill: {
    flex: 1,
    height: PILL_HEIGHT,
    justifyContent: "center",
  },
  searchPill: {
    width: PILL_HEIGHT,
    height: PILL_HEIGHT,
  },
  items: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    height: "100%",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    marginHorizontal: 2,
    borderRadius: 999,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  searchItem: {
    flex: 1,
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
