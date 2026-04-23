import { useCallback, useEffect, useMemo } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import {
  eventScopeKey,
  useScopedEventIds,
  useScopedEvents,
} from "@trace/client-core";
import type { Event } from "@trace/gql";
import { findMostRecentPendingInput } from "@/lib/pending-input";
import { SessionInputComposer } from "./SessionInputComposer";

interface SessionBottomAccessoryComposerProps {
  sessionId: string;
  placement: "inline" | "expanded" | "none";
  onHeightChange: (height: number) => void;
}

export function SessionBottomAccessoryComposer({
  sessionId,
  placement,
  onHeightChange,
}: SessionBottomAccessoryComposerProps) {
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, byTimestamp);
  const events = useScopedEvents(scopeKey);
  const pendingInput = useMemo(
    () => findMostRecentPendingInput(eventIds, events),
    [eventIds, events],
  );
  const visible = placement === "expanded" && !pendingInput;

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onHeightChange(e.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  useEffect(() => {
    if (!visible) onHeightChange(0);
  }, [onHeightChange, visible]);

  if (!visible) return null;

  return (
    <View onLayout={handleLayout}>
      <SessionInputComposer sessionId={sessionId} bottomSafeAreaInset={0} />
    </View>
  );
}

function byTimestamp(a: Event, b: Event): number {
  return a.timestamp.localeCompare(b.timestamp);
}
