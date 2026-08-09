import type { Question } from "@trace/shared";
import { QuestionChoice } from "./QuestionChrome";
import { QuestionRankingControl } from "./QuestionRankingControl";
import { QuestionReferenceControl } from "./QuestionReferenceControl";
import type { FileAttachment } from "../ImageAttachmentBar";
import { QuestionTextControl } from "./QuestionTextControl";
import { QuestionCustomAnswer } from "./QuestionCustomAnswer";

interface QuestionControlProps {
  question: Question;
  selected: ReadonlySet<string>;
  customText: string;
  ranking: readonly string[];
  validationMessage: string | null;
  onToggle: (value: string) => void;
  onTextChange: (value: string) => void;
  onContinue: () => void;
  onMoveRank: (value: string, direction: -1 | 1) => void;
  referenceAttachments?: FileAttachment[];
  onReferenceFiles?: (files: File[]) => void;
  onRemoveReference?: (id: string) => void;
}

export function QuestionControl({
  question,
  selected,
  customText,
  ranking,
  validationMessage,
  onToggle,
  onTextChange,
  onContinue,
  onMoveRank,
  referenceAttachments,
  onReferenceFiles,
  onRemoveReference,
}: QuestionControlProps) {
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");

  if (type === "text") {
    return (
      <QuestionTextControl
        question={question}
        value={customText}
        onChange={onTextChange}
        onContinue={onContinue}
      />
    );
  }
  if (type === "reference") {
    return (
      <QuestionReferenceControl
        value={customText}
        accept={question.accept}
        attachments={referenceAttachments}
        onChange={onTextChange}
        onFiles={onReferenceFiles}
        onRemoveAttachment={onRemoveReference}
      />
    );
  }
  if (type === "ranking") {
    return (
      <div className="grid gap-2">
        <QuestionRankingControl question={question} ranking={ranking} onMove={onMoveRank} />
        <QuestionCustomAnswer
          question={question}
          value={customText}
          onChange={onTextChange}
          onContinue={onContinue}
        />
      </div>
    );
  }
  if (type === "confirm") {
    const options =
      question.options.length > 0
        ? question.options
        : [
            { id: "yes", label: "Yes", description: "" },
            { id: "no", label: "No", description: "" },
          ];
    return (
      <div className="grid gap-2 max-md:gap-4">
        <div className="grid grid-cols-2 gap-2 max-md:gap-3">
          {options.slice(0, 2).map((option, index) => {
            const value = option.id ?? option.label;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected.has(value)}
                onClick={() => onToggle(value)}
                className={`flex min-h-14 flex-col justify-center rounded-lg border px-3 text-left max-md:min-h-28 max-md:rounded-2xl max-md:p-4 ${selected.has(value) ? "border-foreground/35 bg-foreground/[0.08]" : "border-border"}`}
              >
                <span className="text-[13px] font-semibold max-md:text-base">{option.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {index === 0 ? "y" : "n"}
                </span>
              </button>
            );
          })}
        </div>
        <QuestionCustomAnswer
          question={question}
          value={customText}
          onChange={onTextChange}
          onContinue={onContinue}
        />
      </div>
    );
  }

  const multi = type === "multi-select";
  const showOther = type === "select-with-other" || question.other;
  const otherSelected = selected.has("other");
  return (
    <div className="grid gap-2 max-md:gap-3">
      {question.min != null || question.max != null ? (
        <div className="flex font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>
            {question.min != null && question.max != null
              ? `pick ${question.min} to ${question.max}`
              : question.min != null
                ? `pick at least ${question.min}`
                : `pick up to ${question.max}`}
          </span>
          <span className="ml-auto text-foreground">{selected.size} selected</span>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        {question.options.map((option, index) => {
          const value = option.id ?? option.label;
          return (
            <QuestionChoice
              key={value}
              keyHint={String(index + 1)}
              label={option.label}
              detail={option.description}
              selected={selected.has(value)}
              multi={multi}
              onClick={() => onToggle(value)}
            />
          );
        })}
        {showOther ? (
          <QuestionChoice
            keyHint={String(question.options.length + 1)}
            label="Something else"
            selected={otherSelected}
            multi={false}
            onClick={() => onToggle("other")}
          />
        ) : null}
      </div>
      <QuestionCustomAnswer
        question={question}
        value={customText}
        onChange={onTextChange}
        onContinue={onContinue}
      />
      {validationMessage && selected.size > 0 ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-2.5 py-2 text-[11px] leading-4 text-foreground"
        >
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}
