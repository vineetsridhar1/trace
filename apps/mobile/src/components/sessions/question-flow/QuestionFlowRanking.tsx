import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { questionColors, questionMetrics } from "./tokens";

const ROW_STRIDE = questionMetrics.rowHeight + 12;

export function QuestionFlowRanking({ question, ranking, onMove }: { question: Question; ranking: readonly string[]; onMove: (value: string, direction: -1 | 1) => void }) {
  const dragRef = useRef<{ value: string; origin: number; target: number } | null>(null);
  const [drag, setDrag] = useState<{ value: string; origin: number; target: number } | null>(null);
  const beginDrag = useCallback((value: string, index: number) => {
    const next = { value, origin: index, target: index };
    dragRef.current = next;
    setDrag(next);
    void haptic.medium();
  }, []);
  const previewTarget = useCallback((offset: number) => {
    const current = dragRef.current;
    if (!current) return;
    const target = Math.max(0, Math.min(ranking.length - 1, current.origin + Math.round(offset / ROW_STRIDE)));
    if (target === current.target) return;
    const next = { ...current, target };
    dragRef.current = next;
    setDrag(next);
    void haptic.selection();
  }, [ranking.length]);
  const finishDrag = useCallback((value: string, offset: number) => {
    const current = dragRef.current;
    if (!current || current.value !== value) return;
    const target = Math.max(0, Math.min(ranking.length - 1, current.origin + Math.round(offset / ROW_STRIDE)));
    const places = target - current.origin;
    const direction: -1 | 1 = places < 0 ? -1 : 1;
    dragRef.current = null;
    setDrag(null);
    for (let step = 0; step < Math.abs(places); step += 1) onMove(value, direction);
  }, [onMove, ranking.length]);
  const cancelDrag = useCallback((value: string) => {
    if (dragRef.current?.value !== value) return;
    dragRef.current = null;
    setDrag(null);
  }, []);

  return (
    <View style={styles.list}>
      {ranking.map((value, index) => (
        <RankingRow
          key={value}
          value={value}
          label={question.options.find((option) => (option.id ?? option.label) === value)?.label ?? value}
          index={index}
          count={ranking.length}
          drag={drag}
          onBegin={beginDrag}
          onPreview={previewTarget}
          onFinish={finishDrag}
          onCancel={cancelDrag}
          onMove={(places) => {
            const direction: -1 | 1 = places < 0 ? -1 : 1;
            for (let step = 0; step < Math.abs(places); step += 1) onMove(value, direction);
          }}
        />
      ))}
    </View>
  );
}

function RankingRow({ value, label, index, count, drag, onBegin, onPreview, onFinish, onCancel, onMove }: { value: string; label: string; index: number; count: number; drag: { value: string; origin: number; target: number } | null; onBegin: (value: string, index: number) => void; onPreview: (offset: number) => void; onFinish: (value: string, offset: number) => void; onCancel: (value: string) => void; onMove: (places: number) => void }) {
  const translation = useSharedValue(0);
  const active = drag?.value === value;
  const displaced = drag ? displacementFor(index, drag.origin, drag.target) : 0;
  const gesture = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => runOnJS(onBegin)(value, index))
    .onUpdate((event) => {
      translation.value = event.translationY;
      runOnJS(onPreview)(event.translationY);
    })
    .onEnd(() => runOnJS(onFinish)(value, translation.value))
    .onFinalize((_event, success) => {
      translation.value = withTiming(0, { duration: 160 });
      if (!success) runOnJS(onCancel)(value);
    });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: active ? translation.value : withTiming(displaced, { duration: 160 }) },
      { scale: withTiming(active ? 1.025 : 1, { duration: 140 }) },
    ],
    zIndex: active ? 20 : 0,
    shadowOpacity: active ? 0.42 : 0,
  }), [active, displaced]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        layout={LinearTransition.duration(180)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}, position ${index + 1} of ${count}`}
        accessibilityHint="Press and hold, then drag to reorder"
        accessibilityActions={[{ name: "increment", label: "Move down" }, { name: "decrement", label: "Move up" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment" && index < count - 1) onMove(1);
          if (event.nativeEvent.actionName === "decrement" && index > 0) onMove(-1);
        }}
        style={[styles.row, animatedStyle]}
      >
        <Text variant="subheadline" style={styles.number}>{index + 1}</Text>
        <Text variant="subheadline" style={styles.label}>{label}</Text>
        <Text variant="title2" style={styles.handle}>≡</Text>
      </Animated.View>
    </GestureDetector>
  );
}

function displacementFor(index: number, origin: number, target: number): number {
  if (target > origin && index > origin && index <= target) return -ROW_STRIDE;
  if (target < origin && index < origin && index >= target) return ROW_STRIDE;
  return 0;
}

const styles = StyleSheet.create({
  list: { marginTop: 28, gap: 12 },
  row: { minHeight: questionMetrics.rowHeight, borderWidth: 1, borderColor: questionColors.border, borderRadius: questionMetrics.controlRadius, backgroundColor: "rgba(23,23,25,0.96)", paddingHorizontal: 12, flexDirection: "row", gap: 12, alignItems: "center", shadowColor: "#000000", shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  number: { width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, color: questionColors.foreground, backgroundColor: questionColors.primary, fontWeight: "700" },
  label: { flex: 1, color: questionColors.foreground, fontWeight: "600" },
  handle: { width: 44, textAlign: "center", color: questionColors.muted },
});
