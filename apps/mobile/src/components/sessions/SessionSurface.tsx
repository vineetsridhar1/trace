import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { BottomTabBarHeightContext } from "react-native-bottom-tabs";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
  KeyboardGestureArea,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEntityField } from "@trace/client-core";
import { Spinner, Text } from "@/components/design-system";
import { ActiveTodoStrip } from "@/components/sessions/ActiveTodoStrip";
import { PendingInputBar } from "@/components/sessions/PendingInputBar";
import { QueuedMessagesStrip } from "@/components/sessions/QueuedMessagesStrip";
import { SessionErrorCard } from "@/components/sessions/SessionErrorCard";
import { SessionGroupHeader } from "@/components/sessions/SessionGroupHeader";
import { SessionInputComposer } from "@/components/sessions/SessionInputComposer";
import { SessionStream } from "@/components/sessions/SessionStream";
import { SessionTabStrip } from "@/components/sessions/SessionTabStrip";
import { useEnsureSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { useSessionDetail } from "@/hooks/useSessionDetail";
import { useSessionPendingInput } from "@/hooks/useSessionPendingInput";
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
  /** Start stream fetch/subscription work. Disabled while the sheet is closed. */
  loadStreamEvents?: boolean;
  /** Apply fetched/live stream events to state. Delayed until sheet open settles. */
  commitStreamEvents?: boolean;
  /** Mount transcript rows only after outer sheet transitions settle. */
  renderStreamEvents?: boolean;
}

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
  loadStreamEvents = true,
  commitStreamEvents = true,
  renderStreamEvents = true,
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
  const pendingInput = useSessionPendingInput(sessionId, {
    enabled: renderStreamEvents,
  });
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [composerHeight, setComposerHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { height: keyboardTranslation } = useReanimatedKeyboardAnimation();
  const composerInputNativeId = useMemo(
    () => `session-composer-input-${sessionId}`,
    [sessionId],
  );
  const handleComposerLayout = useCallback((e: LayoutChangeEvent) => {
    setComposerHeight(e.nativeEvent.layout.height);
  }, []);
  const restingBottomOffset = Math.max(0, tabBarHeight - insets.bottom);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(Math.max(0, e.endCoordinates.height));
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Both the keyboard frame and the native tab bar height include the home-
  // indicator inset. The composer already pads for that internally, so only
  // apply the remaining covered height here.
  const sceneBottomOffset = Math.max(
    restingBottomOffset,
    Math.max(0, keyboardHeight - insets.bottom),
  );
  const overlayBottom = sceneBottomOffset;
  const streamBottomInset = composerHeight + overlayBottom;
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const keyboardOffset = Math.max(0, -keyboardTranslation.value - insets.bottom);
    const overlayOffset = Math.max(restingBottomOffset, keyboardOffset);
    return {
      transform: [{ translateY: restingBottomOffset - overlayOffset }],
    };
  }, [insets.bottom, keyboardTranslation, restingBottomOffset]);

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
      <View style={styles.streamWrapper}>
        <SessionStream
          key={sessionId}
          sessionId={sessionId}
          topInset={topInset}
          bottomInset={streamBottomInset}
          loadEvents={loadStreamEvents}
          commitEvents={commitStreamEvents}
          renderEvents={renderStreamEvents}
        />
      </View>
      <KeyboardGestureArea
        style={[styles.overlay, { bottom: restingBottomOffset }]}
        offset={composerHeight}
        textInputNativeID={composerInputNativeId}
      >
        <Animated.View
          style={overlayAnimatedStyle}
          onLayout={handleComposerLayout}
          pointerEvents="auto"
        >
          {pendingInput ? (
            <>
              <PendingInputBar sessionId={sessionId} />
              <SessionErrorCard sessionId={sessionId} />
            </>
          ) : (
            <>
              <SessionErrorCard sessionId={sessionId} />
              <QueuedMessagesStrip sessionId={sessionId} />
              <SessionInputComposer
                sessionId={sessionId}
                keyboardVisible={keyboardHeight > 0}
                textInputNativeId={composerInputNativeId}
              />
            </>
          )}
        </Animated.View>
      </KeyboardGestureArea>
    </View>
  );
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
