import { useCallback, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import {
  SEND_SESSION_MESSAGE_MUTATION,
  useQuestionState,
} from "@trace/client-core";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import {
  PendingInputPagerButton,
  PendingInputSendButton,
  PendingInputShell,
  pendingInputStyles,
} from "./PendingInputShell";
import { QuestionOptionPill } from "./QuestionOptionPill";

interface PendingInputQuestionProps {
  sessionId: string;
  questions: Question[];
  keyboardVisible?: boolean;
  /**
   * True when an earlier assistant event in the session is a plan block.
   * When set, the response is sent with `interactionMode: "plan"` so the
   * agent stays in plan mode — matches web's `AskUserQuestionBar` usage.
   */
  hasActivePlan: boolean;
}

/**
 * Question variant of the pending-input bar. Mirrors web's
 * `AskUserQuestionBar`: option pills toggle a per-question selection
 * without sending, an inline "Other…" input collects free-form text,
 * pagination chevrons navigate multi-question payloads, and Send fires
 * only after every question has an answer (built into a single combined
 * `{header}: {answer}` message via `useQuestionState.buildResponse`).
 */
export function PendingInputQuestion({
  sessionId,
  questions,
  hasActivePlan,
  keyboardVisible = false,
}: PendingInputQuestionProps) {
  const theme = useTheme();
  const {
    page,
    total,
    question,
    currentSelected,
    currentCustom,
    isFirstPage,
    isLastPage,
    hasAllAnswers,
    toggleOption,
    setCustomText,
    goNext,
    goPrev,
    buildResponse,
  } = useQuestionState({ questions });

  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (sending || !hasAllAnswers) return;
    const response = buildResponse();
    if (!response) return;
    setSending(true);
    void haptic.light();
    try {
      await getClient()
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: response,
          interactionMode: hasActivePlan ? "plan" : undefined,
        })
        .toPromise();
    } finally {
      setSending(false);
    }
  }, [buildResponse, hasActivePlan, hasAllAnswers, sending, sessionId]);

  const handleSubmit = () => {
    if (hasAllAnswers) void handleSend();
    else if (!isLastPage) goNext();
  };

  const headerTrailing =
    total > 1 ? (
      <Text variant="caption2" color="mutedForeground">
        {page + 1}/{total}
      </Text>
    ) : null;

  return (
    <PendingInputShell
      header={question.header || "Question"}
      headerTrailing={headerTrailing}
      keyboardVisible={keyboardVisible}
    >
      <Text
        variant="footnote"
        color="foreground"
        style={styles.questionText}
        numberOfLines={4}
      >
        {question.question}
      </Text>

      {question.options.length > 0 ? (
        <View style={styles.optionsRow}>
          {question.options.map((opt) => (
            <QuestionOptionPill
              key={opt.label}
              label={opt.label}
              selected={currentSelected.has(opt.label)}
              multiSelect={question.multiSelect}
              onPress={() => {
                void haptic.selection();
                toggleOption(opt.label);
              }}
            />
          ))}
        </View>
      ) : null}

      <View style={pendingInputStyles.bottomRow}>
        <TextInput
          value={currentCustom}
          onChangeText={setCustomText}
          onSubmitEditing={handleSubmit}
          placeholder="Other…"
          placeholderTextColor={theme.colors.dimForeground}
          editable={!sending}
          returnKeyType={hasAllAnswers ? "send" : "next"}
          style={[
            pendingInputStyles.input,
            {
              backgroundColor: theme.colors.surfaceDeep,
              borderColor: theme.colors.border,
              color: theme.colors.foreground,
            },
          ]}
        />
        {total > 1 ? (
          <View style={styles.pager}>
            <PendingInputPagerButton
              icon="chevron.left"
              accessibilityLabel="Previous question"
              disabled={isFirstPage || sending}
              onPress={goPrev}
            />
            <PendingInputPagerButton
              icon="chevron.right"
              accessibilityLabel="Next question"
              disabled={isLastPage || sending}
              onPress={goNext}
            />
          </View>
        ) : null}
        <PendingInputSendButton
          enabled={hasAllAnswers}
          loading={sending}
          accessibilityLabel="Send answer"
          onPress={() => void handleSend()}
        />
      </View>
    </PendingInputShell>
  );
}

const styles = StyleSheet.create({
  questionText: { marginTop: 4 },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  pager: { flexDirection: "row", gap: 4 },
});
