import { Pressable, StyleSheet, View } from "react-native";
import { questionAnswerLabel, useQuestionState } from "@trace/client-core";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { questionColors, questionMetrics } from "./tokens";

export function QuestionFlowReview({
  questions,
  answers,
  onEdit,
}: {
  questions: Question[];
  answers: ReturnType<typeof useQuestionState>["answers"];
  onEdit: (index: number) => void;
}) {
  return (
    <View>
      <View style={styles.readyRow}>
        <View style={styles.dot} />
        <Text variant="footnote" style={styles.ready}>
          Ready to send
        </Text>
      </View>
      <Text variant="title1" style={styles.title}>
        Ready to send your answers?
      </Text>
      <Text variant="subheadline" style={styles.intro}>
        Check each response before resuming the session.
      </Text>
      <View style={styles.list}>
        {questions.map((question, index) => {
          const answer = answers[index];
          return (
            <View key={question.id ?? String(index)} style={styles.row}>
              <Text variant="caption1" style={styles.check}>
                ✓
              </Text>
              <View style={styles.copy}>
                <Text variant="caption1" style={styles.muted}>
                  {question.header || `Question ${index + 1}`}
                </Text>
                <Text variant="subheadline" style={styles.value}>
                  {answer ? questionAnswerLabel(question, answer) : "Not answered"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${question.header || `question ${index + 1}`}`}
                onPress={() => onEdit(index)}
                style={styles.edit}
              >
                <Text variant="caption1" style={styles.muted}>
                  Edit
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      <Text variant="caption1" align="center" style={styles.note}>
        You can return to a question at any time before sending.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  readyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: questionColors.success },
  ready: { color: questionColors.success, fontWeight: "600" },
  title: { color: questionColors.foreground, marginTop: 12, letterSpacing: -0.7 },
  intro: { color: questionColors.muted, marginTop: 10 },
  list: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: questionColors.border,
    borderRadius: questionMetrics.controlRadius,
    overflow: "hidden",
    backgroundColor: "rgba(23,23,25,0.88)",
  },
  row: {
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: questionColors.border,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    lineHeight: 24,
    textAlign: "center",
    color: questionColors.success,
    backgroundColor: "rgba(48,209,88,0.15)",
    fontWeight: "700",
  },
  copy: { flex: 1, gap: 4 },
  muted: { color: questionColors.muted },
  value: { color: questionColors.foreground, fontWeight: "600" },
  edit: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  note: { color: questionColors.muted, marginTop: 16, lineHeight: 20 },
});
