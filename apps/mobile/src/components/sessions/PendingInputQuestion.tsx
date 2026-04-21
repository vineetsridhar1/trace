import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import type { Question } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";
import { PendingInputAnswer } from "./PendingInputAnswer";

interface PendingInputQuestionProps {
  sessionId: string;
  questions: Question[];
}

/**
 * Question variant of the pending-input bar. Renders the most recent
 * question with the answer affordance below — option pills for choice
 * questions, an inline TextInput + Send for free-form.
 *
 * Multi-question payloads display the first question only with a "+N more"
 * affordance — the full pagination flow lives on web; mobile keeps the bar
 * compact by design.
 */
export function PendingInputQuestion({
  sessionId,
  questions,
}: PendingInputQuestionProps) {
  const theme = useTheme();
  const [sending, setSending] = useState(false);

  const question = questions[0];
  const moreCount = questions.length - 1;

  const dispatchAnswer = useCallback(
    async (answer: string) => {
      if (sending || !question) return;
      const trimmed = answer.trim();
      if (!trimmed) return;
      setSending(true);
      void haptic.light();
      const text = question.header
        ? `${question.header}: ${trimmed}`
        : trimmed;
      try {
        await getClient()
          .mutation(SEND_SESSION_MESSAGE_MUTATION, { sessionId, text })
          .toPromise();
      } finally {
        setSending(false);
      }
    },
    [question, sending, sessionId],
  );

  if (!question) return null;

  return (
    <Glass
      preset="pinnedBar"
      style={{
        marginHorizontal: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        borderColor: alpha(theme.colors.statusNeedsInput, 0.32),
        borderWidth: StyleSheet.hairlineWidth,
        padding: theme.spacing.md,
      }}
    >
      <View style={styles.header}>
        <SymbolView
          name="questionmark.circle.fill"
          size={14}
          tintColor={theme.colors.statusNeedsInput}
          resizeMode="scaleAspectFit"
          style={styles.headerIcon}
        />
        <Text
          variant="caption2"
          style={{
            color: theme.colors.statusNeedsInput,
            fontWeight: "700",
            letterSpacing: 0.4,
          }}
        >
          {(question.header || "QUESTION").toUpperCase()}
        </Text>
        {moreCount > 0 ? (
          <Text variant="caption2" color="mutedForeground" style={styles.moreCount}>
            +{moreCount} more
          </Text>
        ) : null}
      </View>

      <Text
        variant="footnote"
        color="foreground"
        style={styles.questionText}
        numberOfLines={3}
      >
        {question.question}
      </Text>

      <PendingInputAnswer
        question={question}
        sending={sending}
        onAnswer={(text) => void dispatchAnswer(text)}
      />
    </Glass>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerIcon: { width: 14, height: 14 },
  moreCount: { marginLeft: "auto" },
  questionText: { marginTop: 6 },
});
