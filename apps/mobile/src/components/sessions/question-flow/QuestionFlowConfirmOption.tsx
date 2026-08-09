import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/design-system";
import { questionColors, questionMetrics } from "./tokens";

export function QuestionFlowConfirmOption({
  label,
  description,
  positive,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  positive: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Text variant="title2" style={[styles.icon, selected && styles.selectedIcon]}>
        {positive ? "✓" : "×"}
      </Text>
      <View>
        <Text variant="callout" style={styles.label}>{label}</Text>
        {description ? <Text variant="caption1" style={styles.description}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    justifyContent: "space-between",
    padding: 16,
    borderRadius: questionMetrics.controlRadius,
    borderWidth: 1,
    borderColor: questionColors.border,
    backgroundColor: "rgba(23,23,25,0.88)",
  },
  selected: {
    borderColor: questionColors.primary,
    backgroundColor: "rgba(0,116,225,0.10)",
  },
  pressed: { opacity: 0.82 },
  icon: { color: questionColors.muted },
  selectedIcon: { color: questionColors.primary },
  label: { color: questionColors.foreground, fontWeight: "600" },
  description: { color: questionColors.muted, marginTop: 4 },
});
