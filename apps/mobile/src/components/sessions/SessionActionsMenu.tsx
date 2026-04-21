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
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
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
const MENU_TOP_OFFSET = 8;

/**
 * Liquid Glass overflow affordance: a circular pill that morphs into a
 * menu card on tap. iOS 26+ runs the trigger and the menu inside the same
 * GlassContainer so the glass visibly "pools" between them during the
 * enter/exit animation. Older OS versions fall back to the stock native
 * ContextMenu rendered inside a BlurView pill.
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
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = open
      ? withSpring(1, { damping: 18, stiffness: 220, mass: 0.9 })
      : withTiming(0, { duration: 180 });
  }, [open, progress]);

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
  // GlassContainer must contain both glass surfaces in its native frame for
  // Liquid Glass pooling to render the liquid bridge between them.
  const containerHeight = TRIGGER_SIZE + MENU_TOP_OFFSET + menuHeight;

  // Menu lives at its final resting position; scaling from the top-right
  // corner (nearest the trigger) lets the pooling stretch out of the trigger
  // as the menu grows, which is the visible "morph".
  const menuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.2 + progress.value * 0.8 }],
  }));

  const triggerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - progress.value * 0.05 }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.18,
  }));

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
        <GlassContainer
          spacing={28}
          style={[
            styles.container,
            { width: MENU_WIDTH, height: containerHeight },
          ]}
        >
          <AnimatedGlassView
            glassEffectStyle="regular"
            colorScheme={theme.scheme === "dark" ? "dark" : "light"}
            style={[styles.triggerPill, triggerAnimatedStyle]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              onPress={handleToggle}
              style={styles.triggerInner}
              hitSlop={8}
              pointerEvents={open ? "none" : "auto"}
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
          </AnimatedGlassView>

          <AnimatedGlassView
            glassEffectStyle="regular"
            colorScheme={theme.scheme === "dark" ? "dark" : "light"}
            style={[styles.menuPill, { height: menuHeight }, menuAnimatedStyle]}
          >
            <View pointerEvents={open ? "auto" : "none"} style={styles.menuInner}>
              <MenuList actions={actions} onPick={handleItem} />
            </View>
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
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    overflow: "visible",
  },
  triggerPill: {
    position: "absolute",
    top: 0,
    right: 0,
    width: TRIGGER_SIZE,
    height: TRIGGER_SIZE,
    borderRadius: TRIGGER_SIZE / 2,
    overflow: "hidden",
  },
  triggerInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 18, height: 18 },
  menuPill: {
    position: "absolute",
    top: TRIGGER_SIZE + MENU_TOP_OFFSET,
    right: 0,
    width: MENU_WIDTH,
    borderRadius: 20,
    overflow: "hidden",
    transformOrigin: "top right",
  },
  menuInner: {
    width: "100%",
    height: "100%",
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
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
});
