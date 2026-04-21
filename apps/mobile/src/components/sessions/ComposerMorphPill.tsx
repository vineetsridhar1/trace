import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView, type SFSymbol } from "expo-symbols";
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
  type AnimatedProps,
} from "react-native-reanimated";
import type { ComponentProps } from "react";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

export interface ComposerMorphPillItem {
  key: string;
  label: string;
  systemIcon?: SFSymbol;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

type GlassAnimatedProps = AnimatedProps<ComponentProps<typeof GlassView>>;

interface ComposerMorphPillProps {
  label: string;
  accessibilityLabel: string;
  items: ComposerMorphPillItem[];
  disabled?: boolean;
  systemIcon?: SFSymbol;
  align?: "left" | "right";
  minWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Animated glass tint props shared with the composer mode palette. */
  tintAnimatedProps?: GlassAnimatedProps;
}

const PILL_HEIGHT = 38;
const ITEM_HEIGHT = 44;
const MENU_WIDTH = 220;
const MENU_RADIUS = 18;
const OPEN_SPRING = { damping: 14, stiffness: 120, mass: 1.2 } as const;
const CLOSE_SPRING = { damping: 22, stiffness: 190, mass: 1.2 } as const;

export function ComposerMorphPill({
  accessibilityLabel,
  align = "left",
  disabled,
  items,
  label,
  minWidth = 92,
  style,
  systemIcon,
  tintAnimatedProps,
}: ComposerMorphPillProps) {
  if (!isLiquidGlassAvailable()) {
    return (
      <FallbackPill
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        items={items}
        label={label}
        minWidth={minWidth}
        style={style}
        systemIcon={systemIcon}
      />
    );
  }

  return (
    <MorphingPill
      accessibilityLabel={accessibilityLabel}
      align={align}
      disabled={disabled}
      items={items}
      label={label}
      minWidth={minWidth}
      style={style}
      systemIcon={systemIcon}
      tintAnimatedProps={tintAnimatedProps}
    />
  );
}

function MorphingPill({
  accessibilityLabel,
  align,
  disabled,
  items,
  label,
  minWidth,
  style,
  systemIcon,
  tintAnimatedProps,
}: Required<Pick<ComposerMorphPillProps, "accessibilityLabel" | "align" | "items" | "label" | "minWidth">> &
  Pick<ComposerMorphPillProps, "disabled" | "style" | "systemIcon" | "tintAnimatedProps">) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState(minWidth);
  const progress = useSharedValue(0);

  const menuHeight = Math.max(PILL_HEIGHT, items.length * ITEM_HEIGHT);
  const endWidth = Math.max(MENU_WIDTH, triggerWidth);
  const anchorEdge = align === "right" ? styles.alignRight : styles.alignLeft;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setTriggerWidth((current) => (current === width ? current : width));
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (disabled || items.length === 0) return;
    void haptic.selection();
    setOpen((current) => !current);
  }, [disabled, items.length]);

  const pick = useCallback((item: ComposerMorphPillItem) => {
    if (item.disabled) return;
    setOpen(false);
    void haptic.light();
    item.onPress?.();
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

  const glassStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [triggerWidth, endWidth]),
    height: interpolate(progress.value, [0, 1], [PILL_HEIGHT, menuHeight]),
    borderRadius: interpolate(progress.value, [0, 1], [PILL_HEIGHT / 2, MENU_RADIUS]),
    transform: [
      { translateY: interpolate(progress.value, [0, 0.55, 1], [0, -18, 0]) },
    ],
  }));
  const triggerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [1, 0], "clamp"),
  }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], "clamp"),
  }));

  return (
    <>
      {open ? (
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={close}
          style={styles.backdropHit}
        />
      ) : null}

      <View
        onLayout={handleLayout}
        style={[styles.anchor, { minWidth }, open ? styles.anchorOpen : null, style]}
      >
        <View pointerEvents="none" style={styles.measureLayer}>
          <PillLabel icon={systemIcon} label={label} />
        </View>
        <AnimatedGlassView
          isInteractive
          glassEffectStyle="regular"
          colorScheme={theme.scheme === "dark" ? "dark" : "light"}
          animatedProps={tintAnimatedProps}
          style={[styles.glass, anchorEdge, glassStyle]}
        >
          {mounted ? (
            <Animated.View
              pointerEvents={open ? "auto" : "none"}
              style={[
                styles.menuLayer,
                anchorEdge,
                { width: endWidth, height: menuHeight },
                menuStyle,
              ]}
            >
              <MenuContent items={items} onPick={pick} />
            </Animated.View>
          ) : null}

          <Animated.View
            pointerEvents={open ? "none" : "auto"}
            style={[
              styles.triggerLayer,
              anchorEdge,
              { width: triggerWidth, height: PILL_HEIGHT },
              triggerStyle,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              disabled={disabled}
              onPress={toggle}
              style={({ pressed }) => [
                styles.triggerInner,
                { opacity: disabled ? 0.5 : pressed ? 0.72 : 1 },
              ]}
            >
              <PillLabel icon={systemIcon} label={label} />
            </Pressable>
          </Animated.View>
        </AnimatedGlassView>
      </View>
    </>
  );
}

function MenuContent({
  items,
  onPick,
}: {
  items: ComposerMorphPillItem[];
  onPick: (item: ComposerMorphPillItem) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.menuList}>
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          disabled={item.disabled}
          onPress={() => onPick(item)}
          style={({ pressed }) => [
            styles.menuItem,
            {
              borderBottomWidth: index < items.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: theme.colors.borderMuted,
              opacity: item.disabled ? 0.42 : pressed ? 0.64 : 1,
            },
          ]}
        >
          <View style={styles.menuItemLabel}>
            {item.systemIcon ? (
              <SymbolView
                name={item.systemIcon}
                size={15}
                tintColor={item.selected ? theme.colors.foreground : theme.colors.mutedForeground}
                resizeMode="scaleAspectFit"
                style={styles.itemIcon}
              />
            ) : null}
            <Text
              variant="caption1"
              color={item.selected ? "foreground" : "mutedForeground"}
              numberOfLines={1}
              style={styles.itemText}
            >
              {item.label}
            </Text>
          </View>
          {item.selected ? (
            <SymbolView
              name="checkmark"
              size={14}
              tintColor={theme.colors.foreground}
              resizeMode="scaleAspectFit"
              style={styles.checkIcon}
            />
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function PillLabel({ icon, label }: { icon?: SFSymbol; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.pillLabel}>
      {icon ? (
        <SymbolView
          name={icon}
          size={13}
          tintColor={theme.colors.mutedForeground}
          resizeMode="scaleAspectFit"
          style={styles.pillIcon}
        />
      ) : null}
      <Text variant="caption1" color="foreground" numberOfLines={1} style={styles.pillText}>
        {label}
      </Text>
    </View>
  );
}

function FallbackPill({
  accessibilityLabel,
  disabled,
  items,
  label,
  minWidth,
  style,
  systemIcon,
}: Pick<
  ComposerMorphPillProps,
  "accessibilityLabel" | "disabled" | "items" | "label" | "minWidth" | "style" | "systemIcon"
>) {
  const theme = useTheme();
  const enabledItems = items.filter((item) => !item.disabled);
  const actions: ContextMenuAction[] = enabledItems.map((item) => ({
    title: item.label,
    systemIcon: item.systemIcon,
  }));
  const handleMenuPress = useCallback(
    (event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
      const item = enabledItems[event.nativeEvent.index];
      if (!item) return;
      void haptic.light();
      item.onPress?.();
    },
    [enabledItems],
  );

  const trigger = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => void haptic.selection()}
      style={({ pressed }) => [
        styles.fallbackPressable,
        { minWidth, opacity: disabled ? 0.5 : pressed ? 0.72 : 1 },
        style,
      ]}
    >
      <BlurView
        tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
        intensity={60}
        style={[
          styles.fallbackGlass,
          { borderColor: alpha(theme.colors.foreground, 0.12) },
        ]}
      >
        <PillLabel icon={systemIcon} label={label} />
      </BlurView>
    </Pressable>
  );

  if (disabled || actions.length === 0) return trigger;
  return (
    <ContextMenu actions={actions} onPress={handleMenuPress} dropdownMenuMode>
      {trigger}
    </ContextMenu>
  );
}

const styles = StyleSheet.create({
  anchor: {
    height: PILL_HEIGHT,
    zIndex: 1,
  },
  anchorOpen: {
    zIndex: 60,
  },
  measureLayer: {
    height: PILL_HEIGHT,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 12,
    opacity: 0,
  },
  glass: {
    position: "absolute",
    bottom: 0,
    overflow: "hidden",
  },
  alignLeft: {
    left: 0,
  },
  alignRight: {
    right: 0,
  },
  triggerLayer: {
    position: "absolute",
    bottom: 0,
  },
  triggerInner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  pillLabel: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pillText: {
    flexShrink: 1,
    fontWeight: "600",
  },
  pillIcon: {
    width: 13,
    height: 13,
  },
  menuLayer: {
    position: "absolute",
    bottom: 0,
  },
  menuList: {
    flex: 1,
  },
  menuItem: {
    height: ITEM_HEIGHT,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  menuItemLabel: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemIcon: {
    width: 15,
    height: 15,
  },
  itemText: {
    minWidth: 0,
    flexShrink: 1,
  },
  checkIcon: {
    width: 14,
    height: 14,
  },
  fallbackPressable: {
    height: PILL_HEIGHT,
  },
  fallbackGlass: {
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
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
