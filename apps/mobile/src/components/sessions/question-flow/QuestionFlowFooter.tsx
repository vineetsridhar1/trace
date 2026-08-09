import { Pressable, StyleSheet, View } from "react-native";
import { Glass, Text } from "@/components/design-system";
import { questionColors, questionMetrics } from "./tokens";

export function QuestionFlowFooter({ label, disabled, backVisible, onBack, onPrimary, bottomInset }: { label: string; disabled: boolean; backVisible: boolean; onBack: () => void; onPrimary: () => void; bottomInset: number }) {
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(28, bottomInset) }]}>
      {backVisible ? <Pressable accessibilityRole="button" accessibilityLabel="Previous question" onPress={onBack} style={styles.back}><Text variant="subheadline" style={styles.backText}>Back</Text></Pressable> : null}
      <Glass preset="input" interactive={!disabled} tint="rgba(0,116,225,0.76)" style={[styles.glass, disabled && styles.disabled]}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPrimary} style={styles.action}>
          <Text variant="body" align="center" style={styles.label}>{label}</Text>
        </Pressable>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "rgba(0,0,0,0.78)" },
  back: { minHeight: questionMetrics.actionHeight, paddingHorizontal: 8, justifyContent: "center" }, backText: { color: questionColors.muted },
  glass: { flex: 1, minHeight: questionMetrics.actionHeight, borderRadius: 26, borderWidth: 1, borderColor: "rgba(255,255,255,0.26)" },
  disabled: { opacity: 0.45 }, action: { flex: 1, minHeight: questionMetrics.actionHeight, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 10 }, label: { color: questionColors.foreground, fontWeight: "600" },
});
