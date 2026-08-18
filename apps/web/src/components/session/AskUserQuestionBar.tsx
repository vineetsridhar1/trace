import { useCallback, useRef, useState } from "react";
import { useQuestionState } from "@trace/client-core";
import type { Question } from "@trace/shared";
import type { FileAttachment } from "./ImageAttachmentBar";
import { QuestionCollapsedTray } from "./questions/QuestionCollapsedTray";
import { QuestionStack } from "./questions/QuestionStack";
import { QuestionTrayFooter } from "./questions/QuestionTrayFooter";
import { QuestionTrayFrame } from "./questions/QuestionTrayFrame";
import { QuestionTrayQuestion } from "./questions/QuestionTrayQuestion";
import { questionTrayHint } from "./questions/questionTrayHint";
import { useQuestionKeyboard } from "./questions/useQuestionKeyboard";
import {
  EMPTY_QUESTION_ATTACHMENTS,
  useQuestionReferenceAttachments,
} from "./questions/useQuestionReferenceAttachments";

interface AskUserQuestionBarProps {
  node: { id: string; questions: Question[] };
  collapsed?: boolean;
  fillPanel?: boolean;
  onResponse: (text: string, attachments?: FileAttachment[]) => void | Promise<void>;
  onDismiss: () => void;
  onResume?: () => void;
}

export function AskUserQuestionBar({
  node,
  collapsed = false,
  fillPanel = false,
  onResponse,
  onDismiss,
  onResume,
}: AskUserQuestionBarProps) {
  const references = useQuestionReferenceAttachments();
  const { beginTransfer, cancelTransfer, clearQuestionReferences } = references;
  const state = useQuestionState(node, references.referenceValues);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const question = state.question;
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const hasLaterAnswers = state.answers.slice(state.page + 1).some((answer) => answer.answered);
  const answeredCount = hasLaterAnswers
    ? state.answers.filter((answer) => answer.answered).length
    : state.page;
  const validationError =
    state.currentSelected.size > 0 && state.validationMessage !== null;

  const responseAttachments = node.questions.some((candidate) => candidate.type === "reference")
    ? references.attachments
    : EMPTY_QUESTION_ATTACHMENTS;
  const send = useCallback(async () => {
    if (sendingRef.current) return;
    const response = state.buildResponse();
    if (!response) return;
    sendingRef.current = true;
    setSending(true);
    beginTransfer();
    try {
      await onResponse(response, responseAttachments);
    } catch {
      cancelTransfer();
      // The response handler owns user-facing error reporting.
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [beginTransfer, cancelTransfer, onResponse, responseAttachments, state.buildResponse]);
  const advance = useCallback(() => {
    if (!state.currentValid) return;
    if (state.isLastPage) void send();
    else state.goNext();
  }, [send, state.currentValid, state.goNext, state.isLastPage]);
  const decideAndAdvance = useCallback(() => {
    if (type === "reference") clearQuestionReferences(state.page);
    state.decideForMe();
    if (!state.isLastPage) state.goNext();
  }, [
    clearQuestionReferences,
    state.decideForMe,
    state.goNext,
    state.isLastPage,
    state.page,
    type,
  ]);

  useQuestionKeyboard({
    disabled: collapsed || sending,
    question,
    type,
    onDismiss,
    onAdvance: advance,
    onToggle: state.toggleOption,
  });

  if (collapsed) {
    return (
      <QuestionCollapsedTray
        questions={node.questions}
        answeredCount={answeredCount}
        nextQuestion={question.question}
        onResume={onResume ?? (() => undefined)}
      />
    );
  }

  const meta =
    state.total === 1
      ? ""
      : answeredCount === 0
        ? `question ${state.page + 1} of ${state.total}`
        : `${answeredCount} of ${state.total} answered`;
  const control = (
    <QuestionTrayQuestion
      question={question}
      selected={state.currentSelected}
      customText={state.currentCustom}
      ranking={state.currentRanking}
      validationMessage={state.validationMessage}
      helperText={questionTrayHint(type, false)}
      showContext={state.total === 1}
      onDecide={decideAndAdvance}
      onToggle={state.toggleOption}
      onTextChange={state.setCustomText}
      onContinue={advance}
      onMoveRank={state.moveRankOption}
      referenceAttachments={references.attachmentsByQuestion[state.page]}
      onReferenceFiles={(files) => references.addReferenceFiles(state.page, files)}
      onRemoveReference={(id) => references.removeReference(state.page, id)}
    />
  );
  return (
    <QuestionTrayFrame
      label={
        validationError ? "Not enough to continue" : "Answer before I continue"
      }
      meta={
        validationError && question.min != null ? `minimum ${question.min}` : meta
      }
      tone={validationError ? "error" : "pending"}
      fill={fillPanel}
      onExit={onDismiss}
      footer={
        <QuestionTrayFooter
          total={state.total}
          isLastQuestion={state.isLastPage}
          disabled={sending || !state.currentValid}
          sending={sending}
          backDisabled={state.isFirstPage}
          onPrimary={advance}
          onBack={state.goPrev}
        />
      }
    >
      {state.total > 1 ? (
        <QuestionStack
          questions={node.questions}
          answers={state.answers}
          page={state.page}
          onEdit={state.setPage}
        >
          {control}
        </QuestionStack>
      ) : (
        control
      )}
    </QuestionTrayFrame>
  );
}
