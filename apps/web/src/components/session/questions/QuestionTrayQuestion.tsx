import type { Question } from "@trace/shared";
import { QuestionControl } from "./QuestionControl";
import type { FileAttachment } from "../ImageAttachmentBar";

function typeLabel(question: Question): string | null {
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  if (type === "single-select") return null;
  if (type !== "multi-select" || (question.min == null && question.max == null)) return type;
  if (question.min != null && question.max != null)
    return `${type} · pick ${question.min}–${question.max}`;
  return question.min != null ? `${type} · min ${question.min}` : `${type} · max ${question.max}`;
}

export function QuestionTrayQuestion({
  question,
  selected,
  customText,
  ranking,
  validationMessage,
  helperText,
  showContext = true,
  onDecide,
  onToggle,
  onTextChange,
  onContinue,
  onMoveRank,
  referenceAttachments,
  onReferenceFiles,
  onRemoveReference,
}: {
  question: Question;
  selected: ReadonlySet<string>;
  customText: string;
  ranking: readonly string[];
  validationMessage: string | null;
  helperText: string;
  showContext?: boolean;
  onDecide: () => void;
  onToggle: (value: string) => void;
  onTextChange: (value: string) => void;
  onContinue: () => void;
  onMoveRank: (value: string, direction: -1 | 1) => void;
  referenceAttachments?: FileAttachment[];
  onReferenceFiles?: (files: File[]) => void;
  onRemoveReference?: (id: string) => void;
}) {
  const label = typeLabel(question);
  const context = showContext ? question.context : undefined;
  return (
    <div className="mt-2 grid gap-2">
      {label || context ? (
        <div className="flex items-center gap-2">
          {label ? (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              {label}
            </span>
          ) : null}
          {context ? (
            <span className="text-[11px] leading-4 text-muted-foreground">{context}</span>
          ) : null}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold leading-5">{question.question}</h3>
      <QuestionControl
        question={question}
        selected={selected}
        customText={customText}
        ranking={ranking}
        validationMessage={validationMessage}
        onToggle={onToggle}
        onTextChange={onTextChange}
        onContinue={onContinue}
        onMoveRank={onMoveRank}
        referenceAttachments={referenceAttachments}
        onReferenceFiles={onReferenceFiles}
        onRemoveReference={onRemoveReference}
      />
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] leading-3 text-muted-foreground">{helperText}</span>
        <button
          type="button"
          onClick={onDecide}
          className="ml-auto min-h-8 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          You decide
        </button>
      </div>
    </div>
  );
}
