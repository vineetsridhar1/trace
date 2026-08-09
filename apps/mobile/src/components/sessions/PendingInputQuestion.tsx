import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SEND_SESSION_MESSAGE_MUTATION, useQuestionState } from "@trace/client-core";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { QuestionFlowControl } from "./question-flow/QuestionFlowControl";
import { QuestionFlowFooter } from "./question-flow/QuestionFlowFooter";
import { QuestionFlowHeader } from "./question-flow/QuestionFlowHeader";
import { QuestionFlowReview } from "./question-flow/QuestionFlowReview";
import { questionColors, questionMetrics } from "./question-flow/tokens";

interface PendingInputQuestionProps {
  sessionId: string;
  questions: Question[];
  hasActivePlan: boolean;
  onClose: () => void;
}

export function PendingInputQuestion({ sessionId, questions, hasActivePlan, onClose }: PendingInputQuestionProps) {
  const insets = useSafeAreaInsets();
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const state = useQuestionState({ questions });
  const { page, total, question, currentSelected, currentCustom, currentRanking, currentValid, validationMessage, isFirstPage, isLastPage, hasAllAnswers, answers } = state;

  const send = useCallback(async () => {
    if (sending || !hasAllAnswers) return;
    const response = state.buildResponse();
    if (!response) return;
    setSending(true);
    void haptic.light();
    try {
      const result = await getClient().mutation(SEND_SESSION_MESSAGE_MUTATION, { sessionId, text: response, interactionMode: hasActivePlan ? "plan" : undefined }).toPromise();
      if (result.error) throw result.error;
      onClose();
    } finally {
      setSending(false);
    }
  }, [hasActivePlan, hasAllAnswers, onClose, sending, sessionId, state]);

  const continueFlow = () => {
    if (!currentValid) return;
    if (isLastPage) setReviewing(true);
    else state.goNext();
  };
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const primaryLabel = sending
    ? "Sending…"
    : reviewing
      ? `Send ${total} answer${total === 1 ? "" : "s"}`
      : isLastPage
        ? "Review answers"
        : validationMessage && question.min
          ? `Choose ${Math.max(1, question.min - currentSelected.size)} more`
          : "Continue";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <QuestionFlowHeader step={reviewing ? `${total} answers` : total > 1 ? `${page + 1} of ${total}` : "Question"} onBack={onClose} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {reviewing ? (
          <QuestionFlowReview questions={questions} answers={answers} onEdit={(index) => { state.setPage(index); setReviewing(false); }} />
        ) : (
          <>
            <View style={styles.prompt}>
              <View style={[styles.dot, { backgroundColor: validationMessage ? questionColors.danger : questionColors.warning }]} />
              <Text variant="footnote" style={[styles.label, { color: validationMessage ? questionColors.danger : questionColors.muted }]}>{validationMessage ? "Needs attention" : question.header || "Answer the agent"}</Text>
              <Text variant="title1" style={styles.title}>{question.question}</Text>
              {question.context ? <Text variant="subheadline" style={styles.context}>{question.context}</Text> : null}
            </View>
            <QuestionFlowControl question={question} type={type} selected={currentSelected} custom={currentCustom} ranking={currentRanking} onToggle={state.toggleOption} onCustom={state.setCustomText} onMove={state.moveRankOption} />
            {validationMessage ? <Text variant="caption1" style={styles.error}>{validationMessage}</Text> : null}
            <Pressable onPress={state.decideForMe} style={styles.decide}><Text variant="subheadline" style={styles.muted}>You decide</Text></Pressable>
          </>
        )}
      </ScrollView>
      <QuestionFlowFooter label={primaryLabel} disabled={sending || (reviewing ? !hasAllAnswers : !currentValid)} backVisible={!reviewing && !isFirstPage} onBack={state.goPrev} onPrimary={() => { if (reviewing) void send(); else continueFlow(); }} bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: questionColors.background }, content: { paddingHorizontal: questionMetrics.pagePadding, paddingTop: 32, paddingBottom: 24 }, prompt: { gap: 10 }, dot: { width: 8, height: 8, borderRadius: 4 }, label: { fontWeight: "600" }, title: { color: questionColors.foreground, letterSpacing: -0.7 }, context: { color: questionColors.muted, lineHeight: 21 }, muted: { color: questionColors.muted }, error: { color: questionColors.foreground, marginTop: 16, borderWidth: 1, borderColor: "rgba(255,69,58,0.5)", backgroundColor: "rgba(255,69,58,0.1)", borderRadius: questionMetrics.controlRadius, paddingHorizontal: 12, paddingVertical: 8 }, decide: { marginTop: 16, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
});
