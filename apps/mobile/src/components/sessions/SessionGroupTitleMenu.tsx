import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useEntityField } from "@trace/client-core";
import type { SessionGroupStatus } from "@trace/gql";
import {
  Chip,
  Spinner,
  Text,
  type ChipVariant,
} from "@/components/design-system";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

const PILL_HEIGHT = 48;
const PANEL_HEIGHT = 320;
const PILL_RADIUS = 14;
const PANEL_RADIUS = 20;
// Match the SessionActionsMenu morph so both pills feel like the same surface.
const OPEN_SPRING = { damping: 14, stiffness: 120, mass: 1.2 } as const;
const CLOSE_SPRING = { damping: 22, stiffness: 190, mass: 1.2 } as const;

interface SessionGroupTitleMenuProps {
  groupId: string;
  /** The session currently shown; drives the status dot's agentStatus overlay. */
  sessionId?: string;
  /** Width the morph should expand to when open — usually the full header row. */
  fullWidth: number;
}

function prChip(
  prUrl: string | null | undefined,
  status: string | null | undefined,
): { label: string; variant: ChipVariant } | null {
  if (!prUrl) return null;
  if (status === "merged") return { label: "PR merged", variant: "done" };
  if (status === "failed" || status === "stopped" || status === "archived") {
    return { label: "PR closed", variant: "failed" };
  }
  return { label: "PR open", variant: "inReview" };
}

/**
 * Liquid Glass session-title affordance: the title pill morphs into a
 * full-width panel on tap, mirroring the SessionActionsMenu morph. Panel
 * contents are a placeholder for now — real options will land here later.
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
  const progress = useSharedValue(0);

  const handleTriggerLayout = useCallback((e: LayoutChangeEvent) => {
    setTriggerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleToggle = useCallback(() => {
    void haptic.light();
    setOpen((prev) => !prev);
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

  const startWidth = triggerWidth || PILL_HEIGHT;
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
      {open ? (
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={() => setOpen(false)}
          style={styles.backdropHit}
        />
      ) : null}

      <View style={styles.anchor} onLayout={handleTriggerLayout}>
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
                styles.panelLayer,
                { width: endWidth, height: PANEL_HEIGHT },
                panelStyle,
              ]}
            >
              <PanelContent groupId={groupId} sessionId={sessionId} />
            </Animated.View>
          ) : null}

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
      </View>
    </>
  );
}

function TitleRow({
  groupId,
  sessionId,
}: {
  groupId: string;
  sessionId?: string;
}) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name") as
    | string
    | null
    | undefined;
  const branch = useEntityField("sessionGroups", groupId, "branch") as
    | string
    | null
    | undefined;
  const prUrl = useEntityField("sessionGroups", groupId, "prUrl") as
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

  const chip = prChip(prUrl, status);

  return (
    <View style={[styles.titleRow, { paddingHorizontal: theme.spacing.md }]}>
      <SessionStatusIndicator
        status={status as SessionGroupStatus | null | undefined}
        agentStatus={agentStatus}
        size={10}
      />
      <View style={styles.textBlock}>
        {name ? (
          <Text variant="headline" numberOfLines={1}>
            {name}
          </Text>
        ) : (
          <Spinner size="small" color="mutedForeground" />
        )}
        {branch ? (
          <Text
            variant="caption1"
            numberOfLines={1}
            color="mutedForeground"
            style={styles.branch}
          >
            {branch}
          </Text>
        ) : null}
      </View>
      {chip ? <Chip label={chip.label} variant={chip.variant} /> : null}
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
  return (
    <View style={styles.panelTitleSlot}>
      <TitleRow groupId={groupId} sessionId={sessionId} />
    </View>
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
  morphingGlass: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    // Keep the morph above the SessionActionsMenu sibling when expanded.
    zIndex: 60,
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
  branch: {
    marginTop: 1,
    fontFamily: "Menlo",
  },
  panelLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  panelTitleSlot: {
    height: PILL_HEIGHT,
    justifyContent: "center",
  },
  fallbackPill: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
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
