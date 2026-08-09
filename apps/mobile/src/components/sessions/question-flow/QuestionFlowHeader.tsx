import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Glass, Text } from "@/components/design-system";
import { questionColors } from "./tokens";

export function QuestionFlowHeader({ step, onBack }: { step: string; onBack: () => void }) {
  return (
    <View style={styles.row}>
      <Glass preset="input" interactive style={styles.circle}>
        <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.center}>
          <SymbolView name="chevron.left" size={22} tintColor={questionColors.foreground} weight="medium" />
        </Pressable>
      </Glass>
      <Glass preset="card" interactive style={styles.titlePill}>
        <View style={styles.statusDot} />
        <View style={styles.copy}>
          <Text variant="headline" style={styles.title} numberOfLines={1}>Answer questions</Text>
          <Text variant="caption2" style={styles.subtitle} numberOfLines={1}>{step}</Text>
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 58, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  circle: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  titlePill: { flex: 1, height: 54, borderRadius: 21, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: questionColors.warning },
  copy: { flex: 1 }, title: { color: questionColors.foreground, fontSize: 18, lineHeight: 20, fontWeight: "600" },
  subtitle: { color: questionColors.muted, marginTop: 2 },
});
