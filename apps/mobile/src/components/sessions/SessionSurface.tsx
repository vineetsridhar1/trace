import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  eventScopeKey,
  useEntityField,
  useScopedEventIds,
  useScopedEvents,
} from "@trace/client-core";
import type { Event } from "@trace/gql";
import { Spinner, Text } from "@/components/design-system";
import { ActiveTodoStrip } from "@/components/sessions/ActiveTodoStrip";
import { PendingInputBar } from "@/components/sessions/PendingInputBar";
import { QueuedMessagesStrip } from "@/components/sessions/QueuedMessagesStrip";
import { SessionGroupHeader } from "@/components/sessions/SessionGroupHeader";
import { SessionInputComposer } from "@/components/sessions/SessionInputComposer";
import { SessionStream } from "@/components/sessions/SessionStream";
import { SessionTabStrip } from "@/components/sessions/SessionTabStrip";
import { useEnsureSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { useKeyboardAnimation } from "@/hooks/useKeyboardAnimation";
import { useSessionDetail } from "@/hooks/useSessionDetail";
import { findMostRecentPendingInput } from "@/lib/pending-input";
import { useTheme } from "@/theme";
import { useMobileUIStore } from "@/stores/ui";

interface SessionSurfaceProps {
  sessionId: string;
  /** Called when the user taps a sibling session in the tab strip. */
  onSelectSession: (sessionId: string) => void;
  /**
   * When true, the SessionGroupHeader and SessionTabStrip are not rendered.
   * The Session Player pulls those into its drag handle so the whole top
   * region responds to pull-down-to-dismiss and the message stream flows
   * behind the glass header.
   */
  hideHeader?: boolean;
  /**
   * Top padding to apply to the message stream's content so the first
   * message starts below an external overlay (e.g. the Session Player's
   * drag-handle + header region) while still allowing content to scroll
   * behind it.
   */
  topInset?: number;
}

// Fraction of the keyboard height the user must pan past for a release to
// commit to dismissal. Anything less springs back to the open position.
const DISMISS_THRESHOLD = 0.35;

/**
 * The complete session surface: group header + sibling tab strip + event
 * stream. Rendered both inside the Session Player (§10.8) and by the
 * deep-link stack route, so both paths land on the same composition.
 */
export function SessionSurface({
  sessionId,
  onSelectSession,
  hideHeader = false,
  topInset,
}: SessionSurfaceProps) {
  const theme = useTheme();
  const groupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const loading = useEnsureSessionGroupDetail(groupId ?? undefined);
  // Loads queuedMessages + per-session gitCheckpoints that the group query
  // doesn't surface — needed by CheckpointMarker (ticket 21) and the queued-
  // messages strip (ticket 23).
  useSessionDetail(sessionId);
  const groupName = useEntityField("sessionGroups", groupId ?? "", "name") as
    | string
    | null
    | undefined;
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, byTimestamp);
  const events = useScopedEvents(scopeKey);
  const pendingInput = useMemo(
    () => findMostRecentPendingInput(eventIds, events),
    [eventIds, events],
  );
  const insets = useSafeAreaInsets();
  const [composerHeight, setComposerHeight] = useState(0);
  const handleComposerLayout = useCallback((e: LayoutChangeEvent) => {
    setComposerHeight(e.nativeEvent.layout.height);
  }, []);

  // Reanimated-driven keyboard offset. `height` is the current visual offset
  // (follows the finger during a pan); `targetHeight` is the keyboard's
  // resting height (used to know how far a drag-down has to go).
  const { height: keyboardHeight, targetHeight: keyboardTarget } =
    useKeyboardAnimation();

  // iOS's keyboard height already includes the home-indicator safe-area, so
  // subtract insets.bottom to avoid double-padding the composer.
  const overlayStyle = useAnimatedStyle(() => {
    const bottom = Math.max(0, keyboardHeight.value - insets.bottom);
    return { transform: [{ translateY: -bottom }] };
  });
  const streamStyle = useAnimatedStyle(() => {
    const bottom = Math.max(0, keyboardHeight.value - insets.bottom);
    return { marginBottom: bottom };
  });

  // Pan gesture on the composer: while the keyboard is up, a downward drag
  // pushes the composer (and overlay) down in sync with the finger. On
  // release, if the user dragged past the threshold (or flicked downward)
  // we dismiss the keyboard — which fires the hide listener and the hook
  // cleanly animates the offset back to 0.
  const dragDismiss = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetY(-8)
        .onUpdate((e) => {
          "worklet";
          if (keyboardTarget.value <= 0) return;
          const next = Math.max(
            0,
            Math.min(keyboardTarget.value, keyboardTarget.value - e.translationY),
          );
          keyboardHeight.value = next;
        })
        .onEnd((e) => {
          "worklet";
          if (keyboardTarget.value <= 0) return;
          const dismissed =
            e.translationY > keyboardTarget.value * DISMISS_THRESHOLD ||
            e.velocityY > 800;
          if (dismissed) {
            runOnJS(Keyboard.dismiss)();
          } else {
            keyboardHeight.value = withTiming(keyboardTarget.value, {
              duration: 180,
            });
          }
        }),
    [keyboardHeight, keyboardTarget],
  );

  useEffect(() => {
    if (!groupId) return;
    const store = useMobileUIStore.getState();
    store.setActiveSessionGroupId(groupId);
    store.setActiveSessionId(sessionId);
    return () => {
      const current = useMobileUIStore.getState();
      if (current.activeSessionGroupId === groupId) current.setActiveSessionGroupId(null);
      if (current.activeSessionId === sessionId) current.setActiveSessionId(null);
    };
  }, [groupId, sessionId]);

  if (!groupId || (loading && !groupName)) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <Spinner size="small" color="mutedForeground" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {hideHeader ? null : (
        <View style={styles.headerLayer}>
          <SessionGroupHeader groupId={groupId} sessionId={sessionId} />
        </View>
      )}
      {hideHeader ? null : (
        <SessionTabStrip
          groupId={groupId}
          activeSessionId={sessionId}
          onSelect={onSelectSession}
        />
      )}
      {hideHeader ? null : <ActiveTodoStrip sessionId={sessionId} />}
      <Animated.View style={[styles.streamWrapper, streamStyle]}>
        <SessionStream
          key={sessionId}
          sessionId={sessionId}
          topInset={topInset}
          bottomInset={composerHeight}
        />
      </Animated.View>
      <GestureDetector gesture={dragDismiss}>
        <Animated.View
          style={[styles.overlay, overlayStyle]}
          onLayout={handleComposerLayout}
          pointerEvents="box-none"
        >
          {pendingInput ? (
            <PendingInputBar sessionId={sessionId} />
          ) : (
            <>
              <QueuedMessagesStrip sessionId={sessionId} />
              <SessionInputComposer sessionId={sessionId} />
            </>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function byTimestamp(a: Event, b: Event): number {
  return a.timestamp.localeCompare(b.timestamp);
}

interface SessionSurfaceEmptyProps {
  message?: string;
}

export function SessionSurfaceEmpty({ message = "No session selected" }: SessionSurfaceEmptyProps) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.colors.background }]}>
      <Text variant="body" color="mutedForeground">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  root: {
    flex: 1,
  },
  headerLayer: {
    zIndex: 10,
  },
  streamWrapper: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
