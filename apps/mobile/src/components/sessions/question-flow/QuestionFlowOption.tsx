import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/design-system";
import { questionColors, questionMetrics } from "./tokens";

export function QuestionFlowOption({ label, description, selected, multiple, onPress }: { label: string; description?: string; selected: boolean; multiple?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}>
      <View style={styles.copy}><Text variant="body" style={styles.label}>{label}</Text>{description ? <Text variant="footnote" style={styles.description}>{description}</Text> : null}</View>
      <View style={[styles.mark, multiple && !selected && styles.multiple, selected && styles.markSelected]}>{selected ? <Text variant="callout" style={styles.check}>✓</Text> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: questionMetrics.rowHeight, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: questionMetrics.controlRadius, borderWidth: 1, borderColor: questionColors.border, backgroundColor: "rgba(23,23,25,0.88)" },
  selected: { borderColor: "rgba(0,116,225,0.6)" }, pressed: { opacity: 0.82 }, copy: { flex: 1 }, label: { color: questionColors.foreground, fontWeight: "500", lineHeight: 20 }, description: { color: questionColors.muted, marginTop: 4, lineHeight: 16 },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" }, multiple: { borderWidth: 1, borderColor: "rgba(160,160,167,0.7)" }, markSelected: { backgroundColor: questionColors.primary }, check: { color: questionColors.foreground, fontWeight: "700" },
});
