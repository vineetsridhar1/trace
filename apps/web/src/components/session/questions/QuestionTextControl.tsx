import type { Question } from "@trace/shared";

export function QuestionTextControl({
  question,
  value,
  onChange,
  onContinue,
  autoFocus = true,
  compact = false,
  showMeta = true,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  autoFocus?: boolean;
  compact?: boolean;
  showMeta?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <textarea
        autoFocus={autoFocus}
        rows={compact ? 1 : 3}
        value={value}
        maxLength={question.maxLength}
        placeholder={question.placeholder ?? "Type your answer…"}
        aria-label={question.question}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onContinue();
        }}
        className={
          compact
            ? "h-12 w-full resize-none rounded-lg border border-border bg-surface-deep/55 px-3 py-2 text-[13px] leading-5 outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30"
            : "min-h-10 w-full resize-none rounded-lg border border-foreground/35 bg-transparent px-3 py-2 text-[13px] leading-5 outline-none ring-2 ring-foreground/10 placeholder:text-muted-foreground"
        }
      />
      {showMeta ? (
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
      ) : null}
    </div>
  );
}
