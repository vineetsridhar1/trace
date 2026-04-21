import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { BlurView } from "expo-blur";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

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
const MENU_RADIUS = 20;
// Open: bouncy spring with a touch of overshoot. Close: snappier so the menu
// doesn't linger on dismiss.
const OPEN_SPRING = { damping: 14, stiffness: 120, mass: 1.2 } as const;
const CLOSE_SPRING = { damping: 22, stiffness: 190, mass: 1.2 } as const;

/**
 * Liquid Glass overflow affordance: a circular pill that morphs into a
 * menu card on tap. The single GlassView interpolates its frame and
 * corner radius while the icon/menu cross-fade in and out. Older OS
 * versions fall back to the stock native ContextMenu inside a BlurView.
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
  // Keeps menu content mounted through the close animation so it can fade out.
  const [mounted, setMounted] = useState(false);
  const progress = useSharedValue(0);

  const menuHeight = actions.length * ITEM_HEIGHT;

  const handleToggle = useCallback(() => {
    void haptic.light();
    setOpen((prev) => !prev);
  }, []);

  const handleItem = useCallback((action: SessionMenuAction) => {
    setOpen(false);
    void haptic.light();
    action.onPress();
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = withSpring(1, OPEN_SPRING);
    } else {
      progress.value = withSpring(0, CLOSE_SPRING, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [open, progress]);

  // Shape morph: pill -> rounded rect, anchored at the trigger's top-right
  // corner. A translateY arc dips the surface down through the middle and
  // then springs back up past the resting line before settling, so the
  // motion reads as "unfold from the trigger with a bounce" instead of
  // drifting to a new center.
  const glassStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [TRIGGER_SIZE, MENU_WIDTH]),
    height: interpolate(progress.value, [0, 1], [TRIGGER_SIZE, menuHeight]),
    borderRadius: interpolate(progress.value, [0, 1], [TRIGGER_SIZE / 2, MENU_RADIUS]),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 0.5, 1], [0, 26, 0]),
      },
    ],
  }));

  // Cross-fade: icon out in the first 40% of the morph, menu in during the last 45%.
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], "clamp"),
  }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], "clamp"),
  }));

  return (
    <>
      {open ? (
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={() => setOpen(false)}
          style={styles.backdropHit}
        />
      ) : null}

      <View style={styles.anchor}>
        <AnimatedGlassView
          isInteractive
          glassEffectStyle="regular"
          colorScheme={theme.scheme === "dark" ? "dark" : "light"}
          style={[styles.morphingGlass, glassStyle]}
        >
          {mounted ? (
            <Animated.View
              pointerEvents={open ? "auto" : "none"}
              style={[
                styles.menuLayer,
                { width: MENU_WIDTH, height: menuHeight },
                menuStyle,
              ]}
            >
              <MenuList actions={actions} onPick={handleItem} />
            </Animated.View>
          ) : null}

          <Animated.View
            pointerEvents={open ? "none" : "auto"}
            style={[styles.triggerLayer, iconStyle]}
          >
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
          </Animated.View>
        </AnimatedGlassView>
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
  morphingGlass: {
    position: "absolute",
    top: 0,
    right: 0,
    overflow: "hidden",
  },
  triggerLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    width: TRIGGER_SIZE,
    height: TRIGGER_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  icon: { width: 18, height: 18 },
  menuLayer: {
    position: "absolute",
    top: 0,
    right: 0,
  },
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
    top: -1000,
    bottom: -2000,
    left: -1000,
    right: -1000,
    zIndex: 50,
  },
});
