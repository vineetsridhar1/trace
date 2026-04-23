import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

export type SessionPageTab = "session" | "browser" | "terminal";

interface SessionPageBottomNavProps {
  activeTab: SessionPageTab;
  onTabChange: (tab: SessionPageTab) => void;
}

const TAB_CONFIG: Array<{
  id: SessionPageTab;
  label: string;
  icon: string;
}> = [
  { id: "session", label: "Session", icon: "text.bubble" },
  { id: "browser", label: "Browser", icon: "globe" },
  { id: "terminal", label: "Terminal", icon: "chevron.left.forwardslash.chevron.right" },
];

export function SessionPageBottomNav({
  activeTab,
  onTabChange,
}: SessionPageBottomNavProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const handlePress = useCallback(
    (tab: SessionPageTab) => {
      if (tab === activeTab) return;
      void haptic.selection();
      onTabChange(tab);
    },
    [activeTab, onTabChange],
  );

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: alpha(theme.colors.surface, 0.96),
          borderTopColor: theme.colors.borderMuted,
          paddingBottom: Math.max(insets.bottom, theme.spacing.sm),
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
        },
      ]}
    >
      {TAB_CONFIG.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => handlePress(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: active
                  ? alpha(theme.colors.accent, 0.14)
                  : pressed
                    ? theme.colors.surfaceElevated
                    : "transparent",
              },
            ]}
          >
            <SymbolView
              name={tab.icon as never}
              size={18}
              tintColor={active ? theme.colors.accent : theme.colors.mutedForeground}
              weight="medium"
              resizeMode="scaleAspectFit"
            />
            <Text
              variant="caption1"
              color={active ? "foreground" : "mutedForeground"}
              style={{ fontWeight: active ? "600" : "500" }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
});
