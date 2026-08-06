import { useCallback, useState } from "react";
import { useQuestionState } from "@trace/client-core";
import type { Question } from "@trace/shared";
import type { FileAttachment } from "./ImageAttachmentBar";
import { QuestionCollapsedTray } from "./questions/QuestionCollapsedTray";
import { QuestionReview } from "./questions/QuestionReview";
import { QuestionStack } from "./questions/QuestionStack";
import { QuestionTrayFooter } from "./questions/QuestionTrayFooter";
import { QuestionTrayFrame } from "./questions/QuestionTrayFrame";
import { QuestionTrayQuestion } from "./questions/QuestionTrayQuestion";
import { useQuestionKeyboard } from "./questions/useQuestionKeyboard";
import {
  EMPTY_QUESTION_ATTACHMENTS,
  useQuestionReferenceAttachments,
} from "./questions/useQuestionReferenceAttachments";

interface AskUserQuestionBarProps {
  node: { id: string; questions: Question[] };
  sessionId?: string;
  collapsed?: boolean;
  onResponse: (text: string, attachments?: FileAttachment[]) => void | Promise<void>;
  onDismiss: () => void;
  onResume?: () => void;
}

export function AskUserQuestionBar({
  node,
  sessionId,
  collapsed = false,
  onResponse,
  onDismiss,
  onResume,
}: AskUserQuestionBarProps) {
  const state = useQuestionState(node);
  const [reviewing, setReviewing] = useState(false);
  const { attachments, addReferenceFiles, removeReference } = useQuestionReferenceAttachments({
    sessionId,
    fallbackId: node.id,
    currentText: state.currentCustom,
    setText: state.setCustomText,
  });
  const question = state.question;
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const hasLaterAnswers = state.answers.slice(state.page + 1).some((answer) => answer.answered);
  const answeredCount = reviewing
    ? state.total
    : hasLaterAnswers
      ? state.answers.filter((answer) => answer.answered).length
      : state.page;
  const validationError =
    !reviewing && state.currentSelected.size > 0 && state.validationMessage !== null;

  const responseAttachments = node.questions.some((candidate) => candidate.type === "reference")
    ? attachments
    : EMPTY_QUESTION_ATTACHMENTS;
  const send = useCallback(() => {
    const response = state.buildResponse();
    if (response) {
      void Promise.resolve(onResponse(response, responseAttachments)).catch(() => undefined);
    }
  }, [onResponse, responseAttachments, state.buildResponse]);
  const advance = useCallback(() => {
    if (!state.currentValid) return;
    if (state.isLastPage) setReviewing(true);
    else state.goNext();
  }, [state.currentValid, state.goNext, state.isLastPage]);

  useQuestionKeyboard({
    disabled: collapsed,
    reviewing,
    question,
    type,
    onDismiss,
    onSend: send,
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
        onDecide={() => {
          state.decideForMe();
          if (state.isLastPage) setReviewing(true);
          else state.goNext();
          onResume?.();
        }}
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
      onToggle={state.toggleOption}
      onTextChange={state.setCustomText}
      onMoveRank={state.moveRankOption}
      referenceAttachments={attachments}
      onReferenceFiles={addReferenceFiles}
      onRemoveReference={removeReference}
    />
  );
  return (
    <QuestionTrayFrame
      label={
        reviewing
          ? "Ready to send"
          : validationError
            ? "Not enough to continue"
            : "Answer before I continue"
      }
      meta={
        reviewing
          ? `${state.total} answer${state.total === 1 ? "" : "s"}`
          : validationError && question.min != null
            ? `minimum ${question.min}`
            : meta
      }
      tone={validationError ? "error" : "pending"}
      onExit={onDismiss}
      footer={
        <QuestionTrayFooter
          reviewing={reviewing}
          total={state.total}
          page={state.page}
          type={type}
          disabled={reviewing ? !state.hasAllAnswers : !state.currentValid}
          onPrimary={reviewing ? send : advance}
          onSecondary={() => {
            if (reviewing) setReviewing(false);
            else {
              state.decideForMe();
              if (state.isLastPage) setReviewing(true);
              else state.goNext();
            }
          }}
        />
      }
    >
      {reviewing ? (
        <QuestionReview
          questions={node.questions}
          answers={state.answers}
          onEdit={(index) => {
            state.setPage(index);
            setReviewing(false);
          }}
        />
      ) : state.total > 1 ? (
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
