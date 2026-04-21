import { StyleSheet, View } from "react-native";
import type { Question } from "@trace/shared";
import { Card, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { formatTime } from "./utils";

interface AskUserQuestionCardProps {
  questions: Question[];
  timestamp: string;
}

/**
 * Read-only display of pending AskUserQuestion blocks. The actual answer
 * affordance ships as the pending-input bar in ticket 22; this component
 * only surfaces the question in the stream.
 */
export function AskUserQuestionCard({ questions, timestamp }: AskUserQuestionCardProps) {
  const theme = useTheme();
  return (
    <Card
      padding="md"
      elevation="low"
      style={{
        ...styles.card,
        backgroundColor: alpha(theme.colors.statusNeedsInput, 0.08),
        borderColor: alpha(theme.colors.statusNeedsInput, 0.32),
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <Text variant="footnote" style={{ color: theme.colors.statusNeedsInput, fontWeight: "700" }}>
        Waiting on you
      </Text>
      {questions.map((q, i) => (
        <View key={i} style={styles.question}>
          {q.header ? (
            <Text variant="caption1" color="mutedForeground">
              {q.header}
            </Text>
          ) : null}
          <Text variant="footnote" color="foreground">
            {q.question}
          </Text>
          {q.options.length > 0 ? (
            <View style={styles.options}>
              {q.options.map((opt, j) => (
                <Text key={j} variant="caption1" color="mutedForeground">
                  · {opt.label}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      <Text variant="caption2" color="dimForeground" style={styles.time}>
        {formatTime(timestamp)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", gap: 6 },
  question: { gap: 2 },
  options: { gap: 2, marginTop: 2 },
  time: { marginTop: 4 },
});
