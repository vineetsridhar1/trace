import { memo, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import type { SessionGroupStatus } from "@trace/gql";
import { useEntityField } from "@trace/client-core";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Text } from "@/components/design-system";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface SessionTabStripProps {
  activeSessionId: string;
  sessionIds: string[];
  onSelect: (sessionId: string) => void;
}

interface TabLayout {
  width: number;
  x: number;
}

export const SessionTabStrip = memo(function SessionTabStrip({
  activeSessionId,
  sessionIds,
  onSelect,
}: SessionTabStripProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  useEffect(() => {
    const layout = layouts[activeSessionId];
    if (!layout) return;
    indicatorX.value = withSpring(layout.x, theme.motion.springs.smooth);
    indicatorWidth.value = withSpring(layout.width, theme.motion.springs.smooth);
    scrollRef.current?.scrollTo({
      x: Math.max(layout.x - theme.spacing.lg, 0),
      animated: true,
    });
  }, [activeSessionId, indicatorWidth, indicatorX, layouts, theme.motion.springs.smooth, theme.spacing.lg]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

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
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setLayouts((current) =>
                  current[sessionId]?.x === x && current[sessionId]?.width === width
                    ? current
                    : { ...current, [sessionId]: { x, width } },
                );
              }}
              onPress={() => {
                if (sessionId === activeSessionId) return;
                void haptic.selection();
                onSelect(sessionId);
              }}
            />
          ))}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                backgroundColor: theme.colors.accent,
                left: 0,
              },
              indicatorStyle,
            ]}
          />
        </View>
      </ScrollView>
    </View>
  );
});

interface SessionTabPillProps {
  sessionId: string;
  active: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onPress: () => void;
}

const SessionTabPill = memo(function SessionTabPill({
  sessionId,
  active,
  onLayout,
  onPress,
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
      onLayout={onLayout}
      onPress={onPress}
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
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    height: 3,
    borderRadius: 999,
  },
});
