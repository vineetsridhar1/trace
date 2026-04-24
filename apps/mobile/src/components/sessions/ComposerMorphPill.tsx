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
  /**
   * Optional trailing icon, rendered in the slot used by the selection
   * checkmark when the row isn't selected. Useful for warnings on disabled
   * rows (e.g. "repo not linked").
   */
  trailingIcon?: SFSymbol;
  trailingIconTint?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

type GlassAnimatedProps = AnimatedProps<ComponentProps<typeof GlassView>>;

interface ComposerMorphPillProps {
  label: string;
  accessibilityLabel: string;
  items: ComposerMorphPillItem[];
  /**
   * Optional segmented switcher rendered above the items list. Tapping a
   * header item does NOT close the menu — use it for scoping the items
   * below (e.g. tool switcher above model list).
   */
  headerItems?: ComposerMorphPillItem[];
  disabled?: boolean;
  systemIcon?: SFSymbol;
  align?: "left" | "right";
  minWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Animated glass tint props shared with the composer mode palette. */
  tintAnimatedProps?: GlassAnimatedProps;
  /** Fires whenever the menu opens or closes. */
  onOpenChange?: (open: boolean) => void;
}

const PILL_HEIGHT = 38;
const ITEM_HEIGHT = 44;
const HEADER_HEIGHT = 46;
const MENU_WIDTH = 220;
const MENU_RADIUS = 18;
const OPEN_SPRING = { damping: 14, stiffness: 120, mass: 1.2 } as const;
const CLOSE_SPRING = { damping: 22, stiffness: 190, mass: 1.2 } as const;
const UNTINTED_GLASS = "rgba(255,255,255,0)";

export function ComposerMorphPill({
  accessibilityLabel,
  align = "left",
  disabled,
  headerItems,
  items,
  label,
  minWidth = 92,
  style,
  systemIcon,
  tintAnimatedProps,
  onOpenChange,
}: ComposerMorphPillProps) {
  if (!isLiquidGlassAvailable()) {
    return (
      <FallbackPill
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        headerItems={headerItems}
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
      headerItems={headerItems}
      items={items}
      label={label}
      minWidth={minWidth}
      style={style}
      systemIcon={systemIcon}
      tintAnimatedProps={tintAnimatedProps}
      onOpenChange={onOpenChange}
    />
  );
}

function MorphingPill({
  accessibilityLabel,
  align,
  disabled,
  headerItems,
  items,
  label,
  minWidth,
  style,
  systemIcon,
  tintAnimatedProps,
  onOpenChange,
}: Required<Pick<ComposerMorphPillProps, "accessibilityLabel" | "align" | "items" | "label" | "minWidth">> &
  Pick<ComposerMorphPillProps, "disabled" | "headerItems" | "style" | "systemIcon" | "tintAnimatedProps" | "onOpenChange">) {
  const theme = useTheme();
  const glassTint = theme.glass.input.tint ?? UNTINTED_GLASS;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);
  const [mounted, setMounted] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState(minWidth);
  const progress = useSharedValue(0);

  const headerH = headerItems && headerItems.length > 0 ? HEADER_HEIGHT : 0;
  const menuHeight = Math.max(PILL_HEIGHT, headerH + items.length * ITEM_HEIGHT);
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

  const pickHeader = useCallback((item: ComposerMorphPillItem) => {
    if (item.disabled || item.selected) return;
    void haptic.selection();
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
          tintColor={glassTint}
          colorScheme={theme.scheme === "dark" ? "dark" : "light"}
          animatedProps={tintAnimatedProps}
          style={[
            styles.glass,
            anchorEdge,
            { backgroundColor: glassTint },
            glassStyle,
          ]}
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
              <MenuContent
                headerItems={headerItems}
                items={items}
                onHeaderPick={pickHeader}
                onPick={pick}
              />
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
  headerItems,
  items,
  onHeaderPick,
  onPick,
}: {
  headerItems?: ComposerMorphPillItem[];
  items: ComposerMorphPillItem[];
  onHeaderPick: (item: ComposerMorphPillItem) => void;
  onPick: (item: ComposerMorphPillItem) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.menuList}>
      {headerItems && headerItems.length > 0 ? (
        <View
          style={[
            styles.segmentedHeader,
            { borderBottomColor: theme.colors.borderMuted },
          ]}
        >
          {headerItems.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              disabled={item.disabled}
              onPress={() => onHeaderPick(item)}
              style={({ pressed }) => [
                styles.segmentedToggle,
                {
                  backgroundColor: item.selected
                    ? alpha(theme.colors.foreground, 0.14)
                    : "transparent",
                  opacity: item.disabled ? 0.42 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                variant="caption1"
                color={item.selected ? "foreground" : "mutedForeground"}
                numberOfLines={1}
                style={styles.segmentedText}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
          ) : item.trailingIcon ? (
            <SymbolView
              name={item.trailingIcon}
              size={14}
              tintColor={item.trailingIconTint ?? theme.colors.mutedForeground}
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
  headerItems,
  items,
  label,
  minWidth,
  style,
  systemIcon,
}: Pick<
  ComposerMorphPillProps,
  "accessibilityLabel" | "disabled" | "headerItems" | "items" | "label" | "minWidth" | "style" | "systemIcon"
>) {
  const theme = useTheme();
  const combinedItems = [...(headerItems ?? []), ...items];
  const enabledItems = combinedItems.filter((item) => !item.disabled);
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
  segmentedHeader: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segmentedToggle: {
    flex: 1,
    height: HEADER_HEIGHT - 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: (HEADER_HEIGHT - 12) / 2,
    paddingHorizontal: 10,
  },
  segmentedText: {
    fontWeight: "600",
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
