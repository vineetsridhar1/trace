import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { BlurView } from "expo-blur";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

export interface SessionMenuAction {
  title: string;
  systemIcon?: SFSymbol;
  destructive?: boolean;
  onPress: () => void;
}

interface SessionActionsMenuProps {
  actions: SessionMenuAction[];
  accessibilityLabel: string;
}

const TRIGGER_SIZE = 48;
const MENU_WIDTH = 240;
const ITEM_HEIGHT = 48;

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

/**
 * The Session Player's overflow affordance, rendered as a Liquid Glass pill
 * that visually morphs into a dropdown card when tapped (iOS 26+ via
 * GlassContainer's native glass pooling). Falls back to the stock native
 * ContextMenu on older OS versions.
 */
export function SessionActionsMenu({ actions, accessibilityLabel }: SessionActionsMenuProps) {
  if (!isLiquidGlassAvailable()) {
    return <FallbackContextMenu actions={actions} accessibilityLabel={accessibilityLabel} />;
  }
  return <MorphingMenu actions={actions} accessibilityLabel={accessibilityLabel} />;
}

function MorphingMenu({ actions, accessibilityLabel }: SessionActionsMenuProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    backdrop.value = withTiming(open ? 1 : 0, { duration: 160 });
  }, [open, backdrop]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value * 0.2 }));

  const handleToggle = useCallback(() => {
    void haptic.light();
    setOpen((o) => !o);
  }, []);

  const handleItem = useCallback((action: SessionMenuAction) => {
    setOpen(false);
    void haptic.light();
    action.onPress();
  }, []);

  const menuHeight = actions.length * ITEM_HEIGHT;

  return (
    <>
      {open ? (
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={() => setOpen(false)}
          style={styles.backdropHit}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.backdropFill, { backgroundColor: "#000" }, backdropStyle]}
          />
        </Pressable>
      ) : null}

      <View style={styles.anchor}>
        <GlassContainer spacing={24} style={styles.anchorFill}>
          <AnimatedGlassView
            glassEffectStyle="regular"
            colorScheme={theme.scheme === "dark" ? "dark" : "light"}
            layout={LinearTransition.springify().damping(20).stiffness(260).mass(0.9)}
            style={[
              styles.pill,
              open
                ? { width: MENU_WIDTH, height: menuHeight, borderRadius: 20 }
                : { width: TRIGGER_SIZE, height: TRIGGER_SIZE, borderRadius: TRIGGER_SIZE / 2 },
            ]}
          >
            {open ? (
              <MenuList actions={actions} onPick={handleItem} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                onPress={handleToggle}
                style={styles.triggerInner}
                hitSlop={8}
              >
                <SymbolView
                  name="ellipsis"
                  size={18}
                  tintColor={theme.colors.foreground}
                  weight="semibold"
                  resizeMode="scaleAspectFit"
                  style={styles.icon}
                />
              </Pressable>
            )}
          </AnimatedGlassView>
        </GlassContainer>
      </View>
    </>
  );
}

function MenuList({
  actions,
  onPick,
}: {
  actions: SessionMenuAction[];
  onPick: (action: SessionMenuAction) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.menuList}>
      {actions.map((action, i) => {
        const tint = action.destructive ? theme.colors.destructive : theme.colors.foreground;
        return (
          <Pressable
            key={`${action.title}-${i}`}
            accessibilityRole="button"
            accessibilityLabel={action.title}
            onPress={() => onPick(action)}
            style={({ pressed }) => [
              styles.menuItem,
              {
                paddingHorizontal: theme.spacing.lg,
                borderBottomWidth: i < actions.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: theme.colors.borderMuted,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="body" color={action.destructive ? "destructive" : "foreground"}>
              {action.title}
            </Text>
            {action.systemIcon ? (
              <SymbolView
                name={action.systemIcon}
                size={18}
                tintColor={tint}
                resizeMode="scaleAspectFit"
                style={styles.menuItemIcon}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function FallbackContextMenu({ actions, accessibilityLabel }: SessionActionsMenuProps) {
  const theme = useTheme();
  const ctxActions: ContextMenuAction[] = actions.map((a) => ({
    title: a.title,
    systemIcon: a.systemIcon,
    destructive: a.destructive,
  }));
  const handleMenuPress = useCallback(
    (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
      actions[e.nativeEvent.index]?.onPress();
    },
    [actions],
  );

  return (
    <ContextMenu actions={ctxActions} onPress={handleMenuPress} dropdownMenuMode>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => void haptic.light()}
      >
        <BlurView
          tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
          intensity={60}
          style={styles.fallbackPill as ViewStyle}
        >
          <SymbolView
            name="ellipsis"
            size={18}
            tintColor={theme.colors.foreground}
            weight="semibold"
            resizeMode="scaleAspectFit"
            style={styles.icon}
          />
        </BlurView>
      </Pressable>
    </ContextMenu>
  );
}

const styles = StyleSheet.create({
  anchor: {
    width: TRIGGER_SIZE,
    height: TRIGGER_SIZE,
  },
  anchorFill: {
    position: "absolute",
    top: 0,
    right: 0,
    alignItems: "flex-end",
  },
  pill: {
    overflow: "hidden",
    alignSelf: "flex-end",
  },
  triggerInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 18, height: 18 },
  menuList: {
    flex: 1,
    width: "100%",
  },
  menuItem: {
    height: ITEM_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuItemIcon: { width: 18, height: 18 },
  fallbackPill: {
    width: TRIGGER_SIZE,
    height: TRIGGER_SIZE,
    borderRadius: TRIGGER_SIZE / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  backdropHit: {
    ...StyleSheet.absoluteFillObject,
    // Render across a huge negative-top region so taps outside the header
    // also dismiss the menu. The absoluteFill coordinates are within the
    // header's container, so extend up/down to cover the visible Player.
    top: -1000,
    bottom: -2000,
    left: -1000,
    right: -1000,
    zIndex: 50,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
});
