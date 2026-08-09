import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { Question } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { questionColors } from "./question-flow/tokens";

export function PendingQuestionPrompt({ sessionId, questions }: { sessionId: string; questions: Question[] }) {
  const router = useRouter();
  const question = questions[0];
  if (!question) return null;
  return (
    <View style={styles.wrap}>
      <Glass preset="card" interactive style={styles.card}>
        <View style={styles.content}>
          <View style={styles.dot} />
          <View style={styles.copy}><Text variant="footnote" style={styles.label}>Agent needs your input</Text><Text variant="subheadline" style={styles.question} numberOfLines={1}>{question.question}</Text></View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Answer question"
            onPress={() => { void haptic.medium(); router.push(`/sessions/question/${sessionId}`); }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text variant="subheadline" align="center" style={styles.actionText}>Answer</Text>
          </Pressable>
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8 }, card: { minHeight: 72, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" }, content: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: questionColors.warning }, copy: { flex: 1 }, label: { color: questionColors.warning, fontWeight: "600" }, question: { color: questionColors.foreground, marginTop: 2, fontSize: 14 }, action: { minHeight: 44, borderRadius: 22, justifyContent: "center", paddingHorizontal: 16, backgroundColor: questionColors.primary, borderWidth: 1, borderColor: "rgba(255,255,255,0.26)" }, pressed: { opacity: 0.82 }, actionText: { color: questionColors.foreground, fontWeight: "600", fontSize: 14 },
});
