import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
  KeyboardGestureArea,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
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
import {
  COMPOSER_INPUT_NATIVE_ID,
  SessionInputComposer,
} from "@/components/sessions/SessionInputComposer";
import { SessionStream } from "@/components/sessions/SessionStream";
import { SessionTabStrip } from "@/components/sessions/SessionTabStrip";
import { useEnsureSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
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

/**
 * The complete session surface: group header + sibling tab strip + event
 * stream. Rendered both inside the Session Player (§10.8) and by the
 * deep-link stack route, so both paths land on the same composition.
 *
 * Keyboard handling uses `react-native-keyboard-controller`'s native bridge:
 * `useReanimatedKeyboardAnimation` gives a UI-thread-driven shared value
 * that tracks the keyboard's real position frame-for-frame (including
 * during an interactive drag), and `KeyboardGestureArea` wraps the whole
 * surface so a swipe-down anywhere over it follows the keyboard natively
 * on iOS and on Android. No JS-side `Keyboard.addListener` plumbing needed.
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

  // `height` is a `SharedValue<number>` tracking the keyboard's vertical
  // offset (negative when open, zero when closed). Driven on the UI thread
  // by the native keyboard-controller module so it stays frame-perfect
  // during interactive drags.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  // iOS's keyboard height already includes the home-indicator safe-area, so
  // clamp by insets.bottom to avoid double-padding the composer.
  const overlayStyle = useAnimatedStyle(() => {
    const offset = Math.min(0, keyboardHeight.value + insets.bottom);
    return { transform: [{ translateY: offset }] };
  });
  const streamStyle = useAnimatedStyle(() => {
    const offset = Math.max(0, -keyboardHeight.value - insets.bottom);
    return { marginBottom: offset };
  });

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
    <KeyboardGestureArea
      interpolator="ios"
      textInputNativeID={COMPOSER_INPUT_NATIVE_ID}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
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
    </KeyboardGestureArea>
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
