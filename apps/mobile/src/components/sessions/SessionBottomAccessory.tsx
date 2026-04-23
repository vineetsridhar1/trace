import { useCallback, useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  eventScopeKey,
  stripPromptWrapping,
  useScopedEventIds,
  useScopedEvents,
} from "@trace/client-core";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { findMostRecentPendingInput } from "@/lib/pending-input";
import { useTheme } from "@/theme";

type SessionAccessoryTab = "session" | "browser" | "terminal";

interface SessionBottomAccessoryProps {
  sessionId: string;
  activeTab: SessionAccessoryTab;
  placement: "inline" | "expanded" | "none";
  onComposerOpen: () => void;
  onHeightChange: (height: number) => void;
}

export function SessionBottomAccessory({
  sessionId,
  activeTab,
  placement,
  onComposerOpen,
  onHeightChange,
}: SessionBottomAccessoryProps) {
  const theme = useTheme();
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, byTimestamp);
  const events = useScopedEvents(scopeKey);
  const lastMessagePreview = useMemo(
    () => findLastUserMessage(eventIds, events),
    [eventIds, events],
  );
  const pendingInput = useMemo(
    () => findMostRecentPendingInput(eventIds, events),
    [eventIds, events],
  );

  const visible = placement !== "none" && !(activeTab === "session" && pendingInput);
  const showInputPreview = activeTab === "session";

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

  const previewText = showInputPreview
    ? "Message…"
    : (lastMessagePreview ?? "No messages yet");

  return (
    <View onLayout={handleLayout} style={styles.wrapper}>
      <Pressable
        accessibilityRole={showInputPreview ? "button" : undefined}
        accessibilityLabel={showInputPreview ? "Open message composer" : undefined}
        disabled={!showInputPreview}
        onPress={showInputPreview ? onComposerOpen : undefined}
      >
        {({ pressed }) => (
          <Glass
            preset="input"
            interactive={showInputPreview}
            style={[
              styles.preview,
              {
                marginHorizontal: theme.spacing.md,
                opacity: showInputPreview && pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={styles.previewRow}>
              <SymbolView
                name="text.bubble"
                size={16}
                tintColor={showInputPreview ? theme.colors.dimForeground : theme.colors.mutedForeground}
                weight="medium"
                resizeMode="scaleAspectFit"
                style={styles.previewIcon}
              />
              <Text
                variant="callout"
                color={showInputPreview ? "dimForeground" : "mutedForeground"}
                numberOfLines={1}
                style={styles.previewText}
              >
                {previewText}
              </Text>
            </View>
          </Glass>
        )}
      </Pressable>
    </View>
  );
}

function findLastUserMessage(eventIds: string[], events: Record<string, Event>): string | null {
  for (let i = eventIds.length - 1; i >= 0; i -= 1) {
    const event = events[eventIds[i] ?? ""];
    if (!event) continue;
    const payload = asJsonObject(event.payload);
    if (payload?.type !== "user") continue;
    const message = asJsonObject(payload.message);
    const content = message?.content;
    if (!Array.isArray(content)) continue;

    const text = content
      .map((block) => {
        const json = asJsonObject(block);
        return typeof json?.text === "string" ? json.text : "";
      })
      .join("\n")
      .trim();

    if (text) return stripPromptWrapping(text);
  }
  return null;
}

function byTimestamp(a: Event, b: Event): number {
  return a.timestamp.localeCompare(b.timestamp);
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 4,
  },
  preview: {
    minHeight: 46,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewIcon: {
    width: 16,
    height: 16,
  },
  previewText: {
    flex: 1,
  },
});
