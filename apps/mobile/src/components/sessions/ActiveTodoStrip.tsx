import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import {
  eventScopeKey,
  useEntityField,
  useScopedEventIds,
  useScopedEvents,
} from "@trace/client-core";
import { Glass, Spinner, Text } from "@/components/design-system";
import { extractLatestTodos, type TodoItem } from "@/lib/extract-todos";
import { alpha, useTheme } from "@/theme";

interface ActiveTodoStripProps {
  sessionId: string;
}

/**
 * Single-line strip showing the agent's current todo and progress. Mounted
 * by `SessionSurface` directly above the stream when the agent is actively
 * working on a TodoWrite plan.
 */
export function ActiveTodoStrip({ sessionId }: ActiveTodoStripProps) {
  const theme = useTheme();
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey);
  const events = useScopedEvents(scopeKey);
  const todos = useMemo(
    () => extractLatestTodos(eventIds, events),
    [eventIds, events],
  );

  const focus = useMemo(() => pickFocusTodo(todos), [todos]);

  // Cross-fade only when the focused label changes after mount; the initial
  // render should appear at full opacity so the strip doesn't flash in.
  const fade = useSharedValue(1);
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    fade.value = 0;
    fade.value = withTiming(1, { duration: theme.motion.durations.accordion });
  }, [fade, focus?.label, theme.motion.durations.accordion]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (agentStatus !== "active" || !todos || todos.length === 0 || !focus) {
    return null;
  }

  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;

  return (
    <Glass
      preset="pinnedBar"
      style={{
        marginHorizontal: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        borderColor: alpha(theme.colors.accent, 0.24),
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View style={styles.row}>
        <View style={styles.indicator}>
          {focus.status === "in_progress" ? (
            <Spinner size="small" color="accent" />
          ) : (
            <SymbolView
              name="circle"
              size={14}
              tintColor={theme.colors.mutedForeground}
              resizeMode="scaleAspectFit"
              style={styles.icon}
            />
          )}
        </View>
        <Animated.View style={[styles.textWrap, fadeStyle]}>
          <Text
            variant="footnote"
            color="foreground"
            numberOfLines={1}
            style={styles.label}
          >
            {focus.label}
          </Text>
        </Animated.View>
        <Text variant="caption1" color="mutedForeground" style={styles.progress}>
          {completed} of {total}
        </Text>
      </View>
    </Glass>
  );
}

interface FocusTodo {
  label: string;
  status: string;
}

function pickFocusTodo(todos: TodoItem[] | null): FocusTodo | null {
  if (!todos || todos.length === 0) return null;
  const inProgress = todos.find((t) => t.status === "in_progress");
  if (inProgress) {
    return {
      label: inProgress.activeForm?.trim() || inProgress.content,
      status: "in_progress",
    };
  }
  const pending = todos.find((t) => t.status !== "completed");
  if (pending) {
    return { label: pending.content, status: pending.status };
  }
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  indicator: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  icon: { width: 14, height: 14 },
  textWrap: { flex: 1, minWidth: 0 },
  label: { fontWeight: "500" },
  progress: { fontVariant: ["tabular-nums"] },
});
