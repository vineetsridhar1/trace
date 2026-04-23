import { memo, useCallback, type ComponentProps } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

export type SessionPageTab = "session" | "browser" | "terminal";

interface SessionPageTabBarProps {
  activeTab: SessionPageTab;
  onChange: (tab: SessionPageTab) => void;
  onHeightChange?: (height: number) => void;
}

const TABS: Array<{
  key: SessionPageTab;
  label: string;
  icon: ComponentProps<typeof SymbolView>["name"];
}> = [
  { key: "session", label: "Session", icon: "text.bubble" },
  { key: "browser", label: "Browser", icon: "globe" },
  { key: "terminal", label: "Terminal", icon: "chevron.left.forwardslash.chevron.right" },
];

export const SessionPageTabBar = memo(function SessionPageTabBar({
  activeTab,
  onChange,
  onHeightChange,
}: SessionPageTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onHeightChange?.(e.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  const handlePress = useCallback(
    (tab: SessionPageTab) => {
      if (tab === activeTab) return;
      void haptic.selection();
      onChange(tab);
    },
    [activeTab, onChange],
  );

  const content = (
    <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
      {TABS.map((tab) => {
        const active = tab.key === activeTab;
        const tintColor = active ? theme.colors.foreground : theme.colors.mutedForeground;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => handlePress(tab.key)}
            style={[styles.tabButton, active ? styles.tabButtonActive : null]}
          >
            <SymbolView
              name={tab.icon}
              size={18}
              tintColor={tintColor}
              weight={active ? "semibold" : "regular"}
              resizeMode="scaleAspectFit"
              style={styles.icon}
            />
            <Text
              variant="caption1"
              color={active ? "foreground" : "mutedForeground"}
              style={active ? styles.activeLabel : styles.inactiveLabel}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View onLayout={handleLayout} style={styles.wrapper}>
      {isLiquidGlassAvailable() ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          colorScheme={theme.scheme === "dark" ? "dark" : "light"}
          style={styles.glass}
        >
          {content}
        </GlassView>
      ) : (
        <BlurView
          tint={theme.scheme === "dark" ? "systemThickMaterialDark" : "systemMaterial"}
          intensity={70}
          style={styles.glass}
        >
          {content}
        </BlurView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  glass: {
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 16,
  },
  tabButtonActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  icon: {
    width: 18,
    height: 18,
  },
  activeLabel: {
    fontWeight: "600",
  },
  inactiveLabel: {
    fontWeight: "500",
  },
});
