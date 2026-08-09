import { Pressable, StyleSheet, View } from "react-native";
import { Glass, Text } from "@/components/design-system";
import { questionColors, questionMetrics } from "./tokens";

interface QuestionFlowFooterProps {
  label: string;
  disabled: boolean;
  backVisible: boolean;
  onBack: () => void;
  onPrimary: () => void;
  bottomInset: number;
}

export function QuestionFlowFooter({
  label,
  disabled,
  backVisible,
  onBack,
  onPrimary,
  bottomInset,
}: QuestionFlowFooterProps) {
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(28, bottomInset) }]}>
      {backVisible ? (
        <View style={styles.backShadow}>
          <Glass preset="input" interactive style={styles.backGlass}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous question"
              onPress={onBack}
              style={styles.back}
            >
              <Text variant="subheadline" align="center" style={styles.backText}>Back</Text>
            </Pressable>
          </Glass>
        </View>
      ) : null}
      <View style={styles.primaryShadow}>
        <Glass
          preset="input"
          interactive={!disabled}
          tint="rgba(0,116,225,0.76)"
          style={[styles.glass, disabled && styles.disabled]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPrimary}
            style={styles.action}
          >
            <Text variant="body" align="center" style={styles.label}>{label}</Text>
          </Pressable>
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "transparent",
  },
  backShadow: {
    width: 88,
    borderRadius: 26,
    shadowColor: "#000000",
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  backGlass: {
    minHeight: questionMetrics.actionHeight,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  back: {
    minHeight: questionMetrics.actionHeight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
  },
  backText: { color: questionColors.foreground, fontWeight: "600" },
  primaryShadow: {
    flex: 1,
    borderRadius: 26,
    shadowColor: "#000000",
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 9,
  },
  glass: {
    minHeight: questionMetrics.actionHeight,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
  },
  disabled: { opacity: 0.45 },
  action: {
    flex: 1,
    minHeight: questionMetrics.actionHeight,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  label: { color: questionColors.foreground, fontWeight: "600" },
});
