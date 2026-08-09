import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { questionColors, questionMetrics } from "./tokens";

const ROW_STRIDE = questionMetrics.rowHeight + 12;

export function QuestionFlowRanking({
  question,
  ranking,
  onMove,
}: {
  question: Question;
  ranking: readonly string[];
  onMove: (value: string, direction: -1 | 1) => void;
}) {
  const moveBy = useCallback(
    (value: string, places: number) => {
      const direction: -1 | 1 = places < 0 ? -1 : 1;
      for (let index = 0; index < Math.abs(places); index += 1) onMove(value, direction);
      void haptic.selection();
    },
    [onMove],
  );

  return (
    <View style={styles.list}>
      {ranking.map((value, index) => (
        <RankingRow
          key={value}
          value={value}
          label={question.options.find((option) => (option.id ?? option.label) === value)?.label ?? value}
          index={index}
          count={ranking.length}
          onMove={moveBy}
        />
      ))}
    </View>
  );
}

function RankingRow({ value, label, index, count, onMove }: { value: string; label: string; index: number; count: number; onMove: (value: string, places: number) => void }) {
  const translation = useSharedValue(0);
  const active = useSharedValue(false);
  const startDrag = () => void haptic.medium();
  const finishDrag = (offset: number) => {
    const places = Math.max(-index, Math.min(count - 1 - index, Math.round(offset / ROW_STRIDE)));
    if (places !== 0) onMove(value, places);
  };
  const gesture = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => { active.value = true; runOnJS(startDrag)(); })
    .onUpdate((event) => { translation.value = event.translationY; })
    .onEnd(() => { runOnJS(finishDrag)(translation.value); })
    .onFinalize(() => { active.value = false; translation.value = withSpring(0); });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translation.value }, { scale: withSpring(active.value ? 1.025 : 1) }],
    zIndex: active.value ? 20 : 0,
    shadowOpacity: active.value ? 0.42 : 0,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}, position ${index + 1} of ${count}`}
        accessibilityHint="Press and hold, then drag to reorder"
        accessibilityActions={[{ name: "increment", label: "Move down" }, { name: "decrement", label: "Move up" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment" && index < count - 1) onMove(value, 1);
          if (event.nativeEvent.actionName === "decrement" && index > 0) onMove(value, -1);
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

const styles = StyleSheet.create({
  list: { marginTop: 28, gap: 12 },
  row: { minHeight: questionMetrics.rowHeight, borderWidth: 1, borderColor: questionColors.border, borderRadius: questionMetrics.controlRadius, backgroundColor: "rgba(23,23,25,0.96)", paddingHorizontal: 12, flexDirection: "row", gap: 12, alignItems: "center", shadowColor: "#000000", shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  number: { width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, color: questionColors.foreground, backgroundColor: questionColors.primary, fontWeight: "700" },
  label: { flex: 1, color: questionColors.foreground, fontWeight: "600" },
  handle: { width: 44, textAlign: "center", color: questionColors.muted },
});
