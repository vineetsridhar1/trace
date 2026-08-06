import type { Question } from "@trace/shared";
import { QuestionChoice } from "./QuestionChrome";
import { QuestionRankingControl } from "./QuestionRankingControl";
import { QuestionReferenceControl } from "./QuestionReferenceControl";
import type { FileAttachment } from "../ImageAttachmentBar";

interface QuestionControlProps {
  question: Question;
  selected: ReadonlySet<string>;
  customText: string;
  ranking: readonly string[];
  validationMessage: string | null;
  onToggle: (value: string) => void;
  onTextChange: (value: string) => void;
  onMoveRank: (value: string, direction: -1 | 1) => void;
  referenceAttachments?: FileAttachment[];
  onReferenceFiles?: (files: File[]) => void;
  onRemoveReference?: (id: string) => void;
}

function TextControl({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <textarea
        autoFocus
        rows={4}
        value={value}
        maxLength={question.maxLength}
        placeholder={question.placeholder ?? "Type your answer…"}
        aria-label={question.question}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-lg border border-foreground/35 bg-surface-deep/55 px-3 py-2 text-[13px] leading-5 outline-none ring-2 ring-foreground/10 placeholder:text-muted-foreground"
      />
      <div className="flex flex-wrap gap-1.5">
        {question.suggestions?.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onChange(suggestion)}
            className="min-h-8 rounded-full border border-border px-3 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
        {question.maxLength ? (
          <span className="ml-auto self-center font-mono text-[10px] text-muted-foreground">
            {value.length} / {question.maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function QuestionControl({
  question,
  selected,
  customText,
  ranking,
  validationMessage,
  onToggle,
  onTextChange,
  onMoveRank,
  referenceAttachments,
  onReferenceFiles,
  onRemoveReference,
}: QuestionControlProps) {
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");

  if (type === "text") {
    return <TextControl question={question} value={customText} onChange={onTextChange} />;
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
    return <QuestionRankingControl question={question} ranking={ranking} onMove={onMoveRank} />;
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
      <div className="grid grid-cols-2 gap-2">
        {options.slice(0, 2).map((option, index) => {
          const value = option.id ?? option.label;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected.has(value)}
              onClick={() => onToggle(value)}
              className={`flex min-h-14 flex-col justify-center rounded-lg border px-3 text-left ${selected.has(value) ? "border-foreground/35 bg-foreground/[0.08]" : "border-border bg-surface-deep/55"}`}
            >
              <span className="text-[13px] font-semibold">{option.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {index === 0 ? "y" : "n"}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const multi = type === "multi-select";
  const showOther = type === "select-with-other" || question.other;
  const otherSelected = selected.has("other");
  return (
    <div className="grid gap-2">
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
      {showOther && otherSelected ? (
        <TextControl
          question={{ ...question, maxLength: question.maxLength ?? 240 }}
          value={customText}
          onChange={onTextChange}
        />
      ) : null}
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
