import { StyleSheet, View } from "react-native";
import type { Question } from "@trace/shared";
import { Card, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { Markdown } from "./Markdown";

interface AskUserQuestionCardProps {
  questions: Question[];
  leadingText?: string;
}

/**
 * Read-only display of pending AskUserQuestion blocks. The actual answer
 * affordance ships as the pending-input bar in ticket 22; this component
 * only surfaces the question in the stream.
 */
export function AskUserQuestionCard({ questions, leadingText }: AskUserQuestionCardProps) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      {leadingText ? <Markdown>{leadingText}</Markdown> : null}
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
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", gap: 12 },
  card: { width: "100%", gap: 6 },
  question: { gap: 2 },
  options: { gap: 2, marginTop: 2 },
});
