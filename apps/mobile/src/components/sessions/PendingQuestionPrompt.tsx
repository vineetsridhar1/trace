import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { Question } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

export function PendingQuestionPrompt({ sessionId, questions }: { sessionId: string; questions: Question[] }) {
  const theme = useTheme();
  const router = useRouter();
  const question = questions[0];
  if (!question) return null;
  return (
    <View style={styles.wrap}>
      <Glass preset="card" interactive style={[styles.card, { borderColor: alpha(theme.colors.warning, 0.38) }]}>
        <View style={styles.content}>
          <View style={styles.meta}><View style={[styles.dot, { backgroundColor: theme.colors.warning }]} /><Text variant="caption1" color="foreground" style={styles.label}>Agent needs your input</Text><Text variant="caption1" color="mutedForeground">1 of {questions.length}</Text></View>
          <Text variant="body" color="foreground" style={styles.question} numberOfLines={2}>{question.question}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Answer question"
            onPress={() => { void haptic.medium(); router.push(`/sessions/question/${sessionId}`); }}
            style={({ pressed }) => [styles.action, { backgroundColor: theme.colors.accent, opacity: pressed ? 0.82 : 1 }]}
          >
            <Text variant="body" color="accentForeground" align="center" style={styles.actionText}>Answer question</Text>
          </Pressable>
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8 }, card: { borderRadius: 26, borderWidth: StyleSheet.hairlineWidth }, content: { padding: 16, gap: 10 }, meta: { flexDirection: "row", alignItems: "center", gap: 8 }, dot: { width: 8, height: 8, borderRadius: 4 }, label: { flex: 1, fontWeight: "700" }, question: { fontWeight: "600", lineHeight: 22 }, action: { minHeight: 50, borderRadius: 25, justifyContent: "center", marginTop: 4 }, actionText: { fontWeight: "700" },
});
