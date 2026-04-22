import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { SymbolView, type SFSymbol } from "expo-symbols";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useEntityField } from "@trace/client-core";
import type { SessionConnection, SessionGroupStatus } from "@trace/gql";
import { Spinner, Text } from "@/components/design-system";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import { LinkedCheckoutPanelSection } from "./LinkedCheckoutPanelSection";
import { SessionWebPreviewPanelSection } from "./SessionWebPreviewPanelSection";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

const PILL_HEIGHT = 48;
const PANEL_HEIGHT = 420;
const PILL_RADIUS = 14;
const PANEL_RADIUS = 20;

interface SessionGroupTitleMenuProps {
  groupId: string;
  /** The session currently shown; drives the status dot's agentStatus overlay. */
  sessionId?: string;
  /** Width the morph should expand to when open — usually the full header row. */
  fullWidth: number;
}

/**
 * Liquid Glass session-title affordance: the inline pill reserves layout
 * space in the header row and captures the open tap. On open, we
 * measureInWindow the pill and render the morphing glass inside a
 * transparent Modal at the same screen coordinates — this escapes the
 * header's ancestor hit-test frame so controls in the expanded panel
 * (e.g. sync/restore buttons that sit below the header baseline) remain
 * tappable. The Modal's full-screen backdrop dismisses on tap.
 * Older OS versions fall back to a static blurred title pill.
 */
export function SessionGroupTitleMenu({
  groupId,
  sessionId,
  fullWidth,
}: SessionGroupTitleMenuProps) {
  if (!isLiquidGlassAvailable()) {
    return <FallbackTitlePill groupId={groupId} sessionId={sessionId} />;
  }
  return (
    <MorphingTitle groupId={groupId} sessionId={sessionId} fullWidth={fullWidth} />
  );
}

function MorphingTitle({ groupId, sessionId, fullWidth }: SessionGroupTitleMenuProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  // Keeps panel content mounted through the close animation so it can fade out.
  const [mounted, setMounted] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState(0);
  // Where the pill sits in window coordinates — captured on open so the
  // Modal glass renders at the same screen position.
  const [triggerPos, setTriggerPos] = useState<{ x: number; y: number; width: number } | null>(null);
  const anchorRef = useRef<View>(null);
  const progress = useSharedValue(0);

  const handleAnchorLayout = useCallback((e: LayoutChangeEvent) => {
    setTriggerWidth(e.nativeEvent.layout.width);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const handleToggle = useCallback(() => {
    void haptic.light();
    if (open) {
      setOpen(false);
      return;
    }
    // Measure the pill's window position so the Modal's glass lines up with
    // it. Without this the morph would snap to the screen origin.
    anchorRef.current?.measureInWindow((x, y, width) => {
      setTriggerPos({ x, y, width });
      setOpen(true);
    });
  }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = withSpring(1, theme.motion.springs.morph.open);
    } else {
      progress.value = withSpring(0, theme.motion.springs.morph.close, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [open, progress, theme.motion.springs.morph.open, theme.motion.springs.morph.close]);

  const startWidth = triggerPos?.width ?? triggerWidth ?? PILL_HEIGHT;
  const endWidth = Math.max(fullWidth, startWidth);

  // Shape morph: rounded pill -> wider rounded card, anchored at the trigger's
  // top-left corner. The translateY arc dips the surface down and springs back
  // so the motion reads as "unfold from the trigger" instead of drifting.
  const glassStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [startWidth, endWidth]),
    height: interpolate(progress.value, [0, 1], [PILL_HEIGHT, PANEL_HEIGHT]),
    borderRadius: interpolate(
      progress.value,
      [0, 1],
      [PILL_RADIUS, PANEL_RADIUS],
    ),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 0.5, 1], [0, 26, 0]),
      },
    ],
  }));

  // Cross-fade: trigger out in the first 40% of the morph, panel in during the last 45%.
  const triggerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], "clamp"),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], "clamp"),
  }));

  return (
    <>
      {/* Inline pill. Reserves space in the header row, captures the tap to
          open, and is hidden while the Modal morph is on screen. */}
      <View
        ref={anchorRef}
        style={[styles.anchor, { opacity: mounted ? 0 : 1 }]}
        onLayout={handleAnchorLayout}
        pointerEvents={mounted ? "none" : "auto"}
      >
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          colorScheme={theme.scheme === "dark" ? "dark" : "light"}
          style={styles.inlinePill}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Workspace details"
            onPress={handleToggle}
            style={styles.triggerInner}
          >
            <TitleRow groupId={groupId} sessionId={sessionId} />
          </Pressable>
        </GlassView>
      </View>

      {/* Portal: morph + panel live here so the expanded surface isn't
          clipped by the header's ancestor chain. Tap anywhere outside the
          glass to dismiss. */}
      <Modal
        transparent
        visible={mounted}
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
      >
        <Pressable
          accessibilityLabel="Dismiss panel"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        {triggerPos ? (
          <AnimatedGlassView
            isInteractive
            glassEffectStyle="regular"
            colorScheme={theme.scheme === "dark" ? "dark" : "light"}
            style={[
              styles.portalGlass,
              { top: triggerPos.y, left: triggerPos.x },
              glassStyle,
            ]}
          >
            <Animated.View
              pointerEvents={open ? "auto" : "none"}
              style={[
                styles.panelLayer,
                { width: endWidth, height: PANEL_HEIGHT },
                panelStyle,
              ]}
            >
              <PanelContent groupId={groupId} sessionId={sessionId} />
            </Animated.View>

            <Animated.View
              pointerEvents={open ? "none" : "auto"}
              style={[
                styles.triggerLayer,
                { width: startWidth || "100%", height: PILL_HEIGHT },
                triggerStyle,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Workspace details"
                onPress={handleToggle}
                style={styles.triggerInner}
              >
                <TitleRow groupId={groupId} sessionId={sessionId} />
              </Pressable>
            </Animated.View>
          </AnimatedGlassView>
        ) : null}
      </Modal>
    </>
  );
}

function TitleRow({
  groupId,
  sessionId,
  nameLines = 1,
}: {
  groupId: string;
  sessionId?: string;
  nameLines?: number;
}) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name") as
    | string
    | null
    | undefined;
  const status = useEntityField("sessionGroups", groupId, "status") as
    | string
    | null
    | undefined;
  const agentStatus = useEntityField(
    "sessions",
    sessionId ?? "",
    "agentStatus",
  ) as string | null | undefined;
  const hosting = useEntityField("sessions", sessionId ?? "", "hosting") as
    | string
    | null
    | undefined;
  const connection = useEntityField("sessions", sessionId ?? "", "connection") as
    | SessionConnection
    | null
    | undefined;
  const bridgeIcon: SFSymbol = hosting === "cloud" ? "cloud" : "laptopcomputer";
  const bridgeLabel =
    hosting === "cloud" ? "Cloud" : (connection?.runtimeLabel ?? "Local");
  const showBridge = !!sessionId && !!hosting;

  return (
    <View style={[styles.titleRow, { paddingHorizontal: theme.spacing.md }]}>
      <SessionStatusIndicator
        status={status as SessionGroupStatus | null | undefined}
        agentStatus={agentStatus}
        size={10}
      />
      <View style={styles.textBlock}>
        {name ? (
          <Text variant="headline" numberOfLines={nameLines}>
            {name}
          </Text>
        ) : (
          <Spinner size="small" color="mutedForeground" />
        )}
        {showBridge ? (
          <View style={styles.bridgeRow}>
            <SymbolView
              name={bridgeIcon}
              size={11}
              tintColor={theme.colors.mutedForeground}
              weight="medium"
              resizeMode="scaleAspectFit"
              style={styles.bridgeIcon}
            />
            <Text
              variant="caption1"
              numberOfLines={1}
              color="mutedForeground"
              style={styles.bridgeLabel}
            >
              {bridgeLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PanelContent({
  groupId,
  sessionId,
}: {
  groupId: string;
  sessionId?: string;
}) {
  const theme = useTheme();
  const branch = useEntityField("sessionGroups", groupId, "branch") as
    | string
    | null
    | undefined;
  return (
    <ScrollView
      style={styles.panelBody}
      contentContainerStyle={styles.panelBodyContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.panelTitleSlot, { paddingVertical: theme.spacing.sm }]}>
        <TitleRow groupId={groupId} sessionId={sessionId} nameLines={2} />
      </View>
      {branch ? (
        <View style={[styles.branchRow, { paddingHorizontal: theme.spacing.md }]}>
          <Text variant="caption1" color="mutedForeground">
            Branch
          </Text>
          <Text
            variant="caption1"
            numberOfLines={1}
            style={styles.branchValue}
          >
            {branch}
          </Text>
        </View>
      ) : null}
      <LinkedCheckoutPanelSection groupId={groupId} />
      <SessionWebPreviewPanelSection groupId={groupId} />
    </ScrollView>
  );
}

function FallbackTitlePill({
  groupId,
  sessionId,
}: {
  groupId: string;
  sessionId?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.anchor}>
      <BlurView
        tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
        intensity={50}
        style={[
          styles.fallbackPill,
          { borderRadius: PILL_RADIUS },
        ]}
      >
        <TitleRow groupId={groupId} sessionId={sessionId} />
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    flex: 1,
    minWidth: 0,
    height: PILL_HEIGHT,
  },
  // Keep `inlinePill.borderRadius` matched to the morph's start value
  // (PILL_RADIUS) so the handoff from the inline glass to the Modal glass
  // is visually seamless. The portal glass animates its own borderRadius
  // from PILL_RADIUS → PANEL_RADIUS in `glassStyle`.
  inlinePill: {
    width: "100%",
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    overflow: "hidden",
  },
  portalGlass: {
    position: "absolute",
    overflow: "hidden",
  },
  triggerLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    justifyContent: "center",
  },
  triggerInner: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  bridgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 4,
  },
  bridgeIcon: { width: 11, height: 11 },
  bridgeLabel: {},
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  branchValue: {
    fontFamily: "Menlo",
    flex: 1,
  },
  panelLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  panelBody: {
    flex: 1,
  },
  panelBodyContent: {
    paddingBottom: 12,
  },
  panelTitleSlot: {
    minHeight: PILL_HEIGHT,
    justifyContent: "center",
  },
  fallbackPill: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
});
