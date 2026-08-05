import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useQuestionState } from "@trace/client-core";
import type { Question } from "@trace/shared";
import { cn } from "@/lib/utils";
import { QuestionCard, QuestionEyebrow, QuestionProgress } from "./questions/QuestionChrome";
import { QuestionControl } from "./questions/QuestionControl";
import { QuestionReview } from "./questions/QuestionReview";

interface AskUserQuestionBarProps {
  node: { id: string; questions: Question[] };
  onResponse: (text: string) => void;
  onDismiss: () => void;
}

export function AskUserQuestionBar({ node, onResponse, onDismiss }: AskUserQuestionBarProps) {
  const state = useQuestionState(node);
  const [reviewing, setReviewing] = useState(false);
  const question = state.question;
  const answeredCount = state.answers.filter((answer) => answer.answered).length;
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const hasQuestionSet = state.total > 1;

  const send = () => {
    const response = state.buildResponse();
    if (response) onResponse(response);
  };

  const advance = () => {
    if (!state.currentValid) return;
    if (state.isLastPage) setReviewing(true);
    else state.goNext();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (reviewing && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        send();
        return;
      }
      if (!reviewing && /^[1-9]$/.test(event.key)) {
        const option = question.options[Number(event.key) - 1];
        if (option) state.toggleOption(option.id ?? option.label);
      }
      if (
        !reviewing &&
        type === "confirm" &&
        (event.key.toLowerCase() === "y" || event.key.toLowerCase() === "n")
      ) {
        const index = event.key.toLowerCase() === "y" ? 0 : 1;
        const option = question.options[index];
        state.toggleOption(option?.id ?? option?.label ?? (index === 0 ? "yes" : "no"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss, question.options, reviewing, state, type]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-background/85 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Questions from the agent"
        className={cn(
          "grid max-h-[min(680px,calc(100vh-32px))] grid-cols-1 overflow-hidden rounded-[14px] border border-foreground/30 bg-surface shadow-2xl",
          hasQuestionSet
            ? "w-[min(720px,calc(100vw-32px))] sm:grid-cols-[212px_1fr]"
            : "w-[min(520px,calc(100vw-32px))]",
        )}
      >
        {hasQuestionSet ? (
          <aside className="hidden border-r border-border bg-surface-deep/55 p-4 sm:block">
            <p className="text-[13px] font-semibold leading-4">Before I continue</p>
            <ol className="mt-4 grid gap-1">
              {node.questions.map((item, index) => {
                const answer = state.answers[index];
                const current = !reviewing && index === state.page;
                return (
                  <li key={item.id ?? `${index}-${item.header}`}>
                    <button
                      type="button"
                      onClick={() => {
                        state.setPage(index);
                        setReviewing(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${current ? "bg-foreground/[0.08]" : ""}`}
                    >
                      <span
                        className={`grid h-4 w-4 place-items-center rounded border font-mono text-[9px] ${answer?.answered ? "border-[color-mix(in_srgb,var(--th-success)_50%,transparent)] text-[var(--th-success)]" : current ? "border-foreground" : "border-border text-muted-foreground"}`}
                      >
                        {answer?.answered ? "✓" : index + 1}
                      </span>
                      <span
                        className={`line-clamp-2 text-xs leading-4 ${current ? "font-semibold" : "text-muted-foreground"}`}
                      >
                        {item.header || item.question}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
        ) : null}

        <div className="flex min-h-0 flex-col">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3">
            <QuestionEyebrow />
            <button
              type="button"
              aria-label="Exit to chat"
              title="Exit to chat (Esc)"
              onClick={onDismiss}
              className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {reviewing ? (
              <QuestionReview
                questions={node.questions}
                answers={state.answers}
                onEdit={(index) => {
                  state.setPage(index);
                  setReviewing(false);
                }}
              />
            ) : (
              <>
                {hasQuestionSet ? (
                  <QuestionProgress
                    current={state.page}
                    total={state.total}
                    answered={answeredCount}
                  />
                ) : null}
                <div className={hasQuestionSet ? "mt-4" : undefined}>
                  {question.context ? (
                    <p className="text-[13px] text-muted-foreground">{question.context}</p>
                  ) : null}
                  <h2
                    className={cn(
                      "text-[22px] font-semibold leading-7 tracking-tight",
                      question.context ? "mt-1.5" : undefined,
                    )}
                  >
                    {question.question}
                  </h2>
                </div>
                <div className="mt-4">
                  <QuestionControl
                    question={question}
                    selected={state.currentSelected}
                    customText={state.currentCustom}
                    ranking={state.currentRanking}
                    validationMessage={state.validationMessage}
                    onToggle={state.toggleOption}
                    onTextChange={state.setCustomText}
                    onMoveRank={state.moveRankOption}
                  />
                </div>
              </>
            )}
            <p className="mt-3 font-mono text-[10px] text-muted-foreground">
              {reviewing ? "⌘↵ send · esc chat" : "number keys pick · ↵ next · esc chat"}
            </p>
          </div>
          <footer className="border-t border-border px-5 py-3">
            <div className="flex flex-wrap justify-end gap-2">
              {!reviewing && !state.isFirstPage ? (
                <button
                  type="button"
                  onClick={state.goPrev}
                  className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground"
                >
                  Back
                </button>
              ) : null}
              {!reviewing ? (
                <button
                  type="button"
                  onClick={() => {
                    state.decideForMe();
                    if (state.isLastPage) setReviewing(true);
                    else state.goNext();
                  }}
                  className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground"
                >
                  You decide
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setReviewing(false)}
                  className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground"
                >
                  Back to questions
                </button>
              )}
              <button
                type="button"
                disabled={reviewing ? !state.hasAllAnswers : !state.currentValid}
                onClick={reviewing ? send : advance}
                className="min-h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:border disabled:border-border disabled:bg-transparent disabled:text-muted-foreground"
              >
                {reviewing
                  ? `Send ${state.total} answer${state.total === 1 ? "" : "s"}`
                  : state.isLastPage
                    ? `Review ${state.total} answer${state.total === 1 ? "" : "s"}`
                    : "Next question"}
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}

export function QuestionWaitingCard({
  node,
  onResume,
  onDecide,
}: {
  node: { questions: Question[] };
  onResume: () => void;
  onDecide: () => void;
}) {
  const next = node.questions[0];
  return (
    <QuestionCard className="mx-3 mb-2 px-3 py-2.5 pl-4 shadow-xl">
      <QuestionEyebrow
        label={`${node.questions.length} question${node.questions.length === 1 ? "" : "s"} waiting`}
      />
      <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-[18px]">{next?.question}</p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onResume}
          className="min-h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background"
        >
          Resume answering
        </button>
        <button
          type="button"
          onClick={onDecide}
          className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground"
        >
          You decide
        </button>
      </div>
    </QuestionCard>
  );
}
