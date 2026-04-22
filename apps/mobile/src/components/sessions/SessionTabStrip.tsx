import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { SessionGroupStatus } from "@trace/gql";
import { useEntityField } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { useSessionGroupSessionIds } from "@/hooks/useSessionGroupDetail";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface SessionTabStripProps {
  groupId: string;
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
}

export const SessionTabStrip = memo(function SessionTabStrip({
  groupId,
  activeSessionId,
  onSelect,
}: SessionTabStripProps) {
  const theme = useTheme();
  const sessionIds = useSessionGroupSessionIds(groupId);
  const scrollRef = useRef<ScrollView>(null);
  const [layouts, setLayouts] = useState<Record<string, number>>({});

  useEffect(() => {
    const x = layouts[activeSessionId];
    if (x === undefined) return;
    scrollRef.current?.scrollTo({
      x: Math.max(x - theme.spacing.lg, 0),
      animated: true,
    });
  }, [activeSessionId, layouts, theme.spacing.lg]);

  // Stable callback so SessionTabPill memoization is not broken.
  const handleLayout = useCallback((sessionId: string, x: number) => {
    setLayouts((current) => (current[sessionId] === x ? current : { ...current, [sessionId]: x }));
  }, []);

  if (sessionIds.length <= 1) return null;

  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderMuted }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.md,
        }}
      >
        <View style={styles.row}>
          {sessionIds.map((sessionId) => (
            <SessionTabPill
              key={sessionId}
              sessionId={sessionId}
              active={sessionId === activeSessionId}
              onLayout={handleLayout}
              onSelect={onSelect}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

interface SessionTabPillProps {
  sessionId: string;
  active: boolean;
  onLayout: (sessionId: string, x: number) => void;
  onSelect: (sessionId: string) => void;
}

const SessionTabPill = memo(function SessionTabPill({
  sessionId,
  active,
  onLayout,
  onSelect,
}: SessionTabPillProps) {
  const theme = useTheme();
  const name = useEntityField("sessions", sessionId, "name") as string | null | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | SessionGroupStatus
    | null
    | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as
    | string
    | null
    | undefined;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={name ?? "Session"}
      onLayout={(e) => onLayout(sessionId, e.nativeEvent.layout.x)}
      onPress={() => {
        if (active) return;
        void haptic.selection();
        onSelect(sessionId);
      }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active
            ? alpha(theme.colors.accent, 0.16)
            : pressed
              ? theme.colors.surfaceElevated
              : theme.colors.surface,
          borderColor: active ? alpha(theme.colors.accent, 0.32) : theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
        },
      ]}
    >
      <SessionStatusIndicator status={sessionStatus} agentStatus={agentStatus} size={8} />
      <Text
        variant="footnote"
        numberOfLines={1}
        color={active ? "foreground" : "mutedForeground"}
        style={{ fontWeight: active ? "600" : "500" }}
      >
        {name ?? "Session"}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
  },
});
