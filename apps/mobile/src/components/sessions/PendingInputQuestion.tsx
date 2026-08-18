import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore, useQuestionState, type AuthState } from "@trace/client-core";
import type { Question, QuestionType } from "@trace/shared";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { submitQuestionResponse } from "@/lib/question-response-submit";
import { userFacingError } from "@/lib/requestError";
import type { FileAttachment } from "@/stores/drafts";
import { QuestionFlowControl } from "./question-flow/QuestionFlowControl";
import { QuestionFlowFooter } from "./question-flow/QuestionFlowFooter";
import { QuestionFlowHeader } from "./question-flow/QuestionFlowHeader";
import { QuestionFlowOption } from "./question-flow/QuestionFlowOption";
import { questionColors, questionMetrics } from "./question-flow/tokens";

interface PendingInputQuestionProps {
  sessionId: string;
  questions: Question[];
  hasActivePlan: boolean;
  onClose: () => void;
  onSendingChange?: (sending: boolean) => void;
}

const EMPTY_ATTACHMENTS: readonly FileAttachment[] = [];

export function PendingInputQuestion({
  sessionId,
  questions,
  hasActivePlan,
  onClose,
  onSendingChange,
}: PendingInputQuestionProps) {
  const insets = useSafeAreaInsets();
  const organizationId = useAuthStore((state: AuthState) => state.activeOrgId);
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [referenceAttachments, setReferenceAttachments] = useState<
    Record<number, FileAttachment[]>
  >({});
  const referenceValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(referenceAttachments).map(([index, attachments]) => [
          Number(index),
          attachments.map((attachment) => attachment.filename),
        ]),
      ),
    [referenceAttachments],
  );
  const state = useQuestionState({ questions }, referenceValues);
  const {
    page,
    total,
    question,
    currentSelected,
    currentCustom,
    currentRanking,
    currentValid,
    validationMessage,
    isFirstPage,
    isLastPage,
    hasAllAnswers,
    answers,
  } = state;
  const currentAssumed = answers[page]?.assumed ?? false;
  const currentReferenceAttachments = referenceAttachments[page] ?? EMPTY_ATTACHMENTS;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const updateUploadedAttachments = useCallback((uploaded: FileAttachment[]) => {
    const uploadedById = new Map(uploaded.map((attachment) => [attachment.id, attachment]));
    setReferenceAttachments((current) =>
      Object.fromEntries(
        Object.entries(current).map(([index, attachments]) => [
          Number(index),
          attachments.map((attachment) => uploadedById.get(attachment.id) ?? attachment),
        ]),
      ),
    );
  }, []);

  const send = useCallback(async () => {
    if (sending || !hasAllAnswers) return;
    const response = state.buildResponse();
    if (!response) return;
    const attachments = Object.values(referenceAttachments).flat();
    setSending(true);
    setSendError(null);
    onSendingChange?.(true);
    void haptic.light();
    try {
      await submitQuestionResponse({
        sessionId,
        text: response,
        interactionMode: hasActivePlan ? "plan" : undefined,
        attachments,
        organizationId,
        onAttachmentsUploaded: updateUploadedAttachments,
      });
      onClose();
    } catch (error) {
      setSendError(userFacingError(error, "Failed to send answers. Try again."));
      void haptic.error();
    } finally {
      setSending(false);
      onSendingChange?.(false);
    }
  }, [
    hasActivePlan,
    hasAllAnswers,
    onClose,
    onSendingChange,
    organizationId,
    referenceAttachments,
    sending,
    sessionId,
    state,
    updateUploadedAttachments,
  ]);

  const continueFlow = () => {
    if (!currentValid) return;
    setSendError(null);
    if (isLastPage) void send();
    else state.goNext();
  };
  const letAgentDecide = () => {
    setReferenceAttachments((current) => {
      if (!current[page]) return current;
      const next = { ...current };
      delete next[page];
      return next;
    });
    void haptic.selection();
    state.decideForMe();
  };
  const type: QuestionType =
    question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const primaryLabel = sending
    ? "Sending…"
    : sendError
      ? "Try again"
      : isLastPage
        ? `Send ${total} answer${total === 1 ? "" : "s"}`
        : validationMessage && question.min
          ? `Choose ${Math.max(1, question.min - currentSelected.size)} more`
          : "Continue";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <QuestionFlowHeader
        step={total > 1 ? `${page + 1} of ${total}` : "Question"}
        onBack={onClose}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
      >
        <>
            <View style={styles.prompt}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: validationMessage ? questionColors.danger : questionColors.warning },
                ]}
              />
              <Text
                variant="footnote"
                style={[
                  styles.label,
                  { color: validationMessage ? questionColors.danger : questionColors.muted },
                ]}
              >
                {validationMessage ? "Needs attention" : question.header || "Answer the agent"}
              </Text>
              <Text variant="title1" style={styles.title}>{question.question}</Text>
              {question.context ? (
                <Text variant="subheadline" style={styles.context}>{question.context}</Text>
              ) : null}
            </View>
            <QuestionFlowControl
              question={question}
              type={type}
              selected={currentSelected}
              custom={currentCustom}
              ranking={currentRanking}
              referenceAttachments={currentReferenceAttachments}
              onToggle={(value) => {
                void haptic.selection();
                state.toggleOption(value);
              }}
              onCustom={state.setCustomText}
              onMove={state.moveRankOption}
              onAddReferenceAttachments={(attachments) =>
                setReferenceAttachments((current) => ({
                  ...current,
                  [page]: [...(current[page] ?? []), ...attachments],
                }))
              }
              onRemoveReferenceAttachment={(id) =>
                setReferenceAttachments((current) => ({
                  ...current,
                  [page]: (current[page] ?? []).filter((attachment) => attachment.id !== id),
                }))
              }
            />
            {validationMessage ? (
              <Text accessibilityRole="alert" variant="caption1" style={styles.error}>
                {validationMessage}
              </Text>
            ) : null}
            <View style={styles.decide}>
              <QuestionFlowOption
                label="You decide"
                description="Choose the smallest useful next step."
                selected={currentAssumed}
                onPress={letAgentDecide}
              />
            </View>
        </>
      </ScrollView>
      <KeyboardStickyView
        offset={{ opened: -8 }}
        pointerEvents="box-none"
        style={styles.overlayHost}
      >
        <View pointerEvents="box-none" style={styles.actionStack}>
          {sendError ? (
            <View accessibilityRole="alert" style={styles.sendError}>
              <Text variant="caption1" style={styles.sendErrorText}>{sendError}</Text>
            </View>
          ) : null}
          <QuestionFlowFooter
            label={primaryLabel}
            disabled={sending || !currentValid}
            backVisible={!isFirstPage}
            onBack={state.goPrev}
            onPrimary={continueFlow}
            bottomInset={keyboardVisible ? 0 : insets.bottom}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: questionColors.background },
  content: { paddingHorizontal: questionMetrics.pagePadding, paddingTop: 32, paddingBottom: 124 },
  prompt: { gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontWeight: "600" },
  title: { color: questionColors.foreground, letterSpacing: -0.7 },
  context: { color: questionColors.muted, lineHeight: 21 },
  error: { color: questionColors.foreground, marginTop: 16, borderWidth: 1, borderColor: "rgba(255,69,58,0.5)", backgroundColor: "rgba(255,69,58,0.1)", borderRadius: questionMetrics.controlRadius, paddingHorizontal: 12, paddingVertical: 8 },
  decide: { marginTop: 12 },
  overlayHost: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  actionStack: { backgroundColor: "transparent" },
  sendError: { marginHorizontal: 16, marginBottom: 2, borderWidth: 1, borderColor: "rgba(255,69,58,0.5)", backgroundColor: "rgba(12,12,14,0.94)", borderRadius: questionMetrics.controlRadius, paddingHorizontal: 12, paddingVertical: 10 },
  sendErrorText: { color: questionColors.foreground },
});
