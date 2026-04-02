import { useState } from "react";
import { X, Send, ChevronLeft, ChevronRight } from "lucide-react";
import type { Question, QuestionOption } from "@trace/shared";
import { cn } from "../../lib/utils";

export type QuestionData = Question;

interface InboxQuestionBodyProps {
  questions: QuestionData[];
  sending: boolean;
  onSend: (text: string) => void;
  onDismiss: () => void;
}

export function InboxQuestionBody({
  questions,
  sending,
  onSend,
  onDismiss,
}: InboxQuestionBodyProps) {
  const total = questions.length;
  const [page, setPage] = useState(0);
  const [selections, setSelections] = useState<Record<number, Set<string>>>({});
  const [customTexts, setCustomTexts] = useState<Record<number, string>>({});

  const q = questions[page];
  if (!q) return null;

  const currentSelected = selections[page] ?? new Set<string>();
  const currentCustom = customTexts[page] ?? "";
  const isLastPage = page === total - 1;
  const isFirstPage = page === 0;

  const hasAllAnswers = Array.from({ length: total }, (_, i) => {
    const sel = selections[i];
    const custom = (customTexts[i] ?? "").trim();
    return (sel && sel.size > 0) || custom.length > 0;
  }).every(Boolean);

  const toggleOption = (label: string) => {
    setSelections((prev: Record<number, Set<string>>) => {
      const current = prev[page] ?? new Set<string>();
      const next = new Set(current);
      if (q.multiSelect) {
        if (next.has(label)) next.delete(label);
        else next.add(label);
      } else {
        if (next.has(label)) next.clear();
        else { next.clear(); next.add(label); }
      }
      return { ...prev, [page]: next };
    });
  };

  const setCustomText = (text: string) => {
    setCustomTexts((prev: Record<number, string>) => ({ ...prev, [page]: text }));
  };

  const buildResponse = (): string | null => {
    const parts: string[] = [];
    for (let i = 0; i < total; i++) {
      const qi = questions[i];
      const selected = selections[i];
      const custom = (customTexts[i] ?? "").trim();
      if (custom) {
        parts.push(`${qi.header}: ${custom}`);
      } else if (selected && selected.size > 0) {
        parts.push(`${qi.header}: ${[...selected].join(", ")}`);
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  };

  const handleSubmit = () => {
    const response = buildResponse();
    if (response) onSend(response);
  };

  return (
    <div className="px-4 pb-3">
      {/* Question header + pagination */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          {q.header}
        </span>
        {total > 1 && (
          <span className="text-[11px] text-muted-foreground">
            {page + 1}/{total}
          </span>
        )}
      </div>

      {/* Question text */}
      <p className="mb-2 text-sm text-foreground">{q.question}</p>

      {/* Option pills */}
      {q.options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {q.options.map((opt: QuestionOption) => (
            <button
              key={opt.label}
              type="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleOption(opt.label); }}
              disabled={sending}
              title={opt.description}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                currentSelected.has(opt.label)
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
                sending && "opacity-50",
              )}
            >
              {q.multiSelect ? (
                <span className={cn(
                  "flex h-3 w-3 shrink-0 items-center justify-center rounded border",
                  currentSelected.has(opt.label) ? "border-accent bg-accent" : "border-muted-foreground",
                )}>
                  {currentSelected.has(opt.label) && (
                    <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              ) : (
                <span className={cn(
                  "flex h-3 w-3 shrink-0 items-center justify-center rounded-full border",
                  currentSelected.has(opt.label) ? "border-accent" : "border-muted-foreground",
                )}>
                  {currentSelected.has(opt.label) && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </span>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Input + nav + actions */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={currentCustom}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomText(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (hasAllAnswers) handleSubmit();
            }
          }}
          placeholder="Other..."
          disabled={sending}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-deep px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />

        {total > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (!isFirstPage) setPage((p: number) => p - 1); }}
              disabled={isFirstPage}
              className="rounded-md border border-border px-1.5 py-1.5 text-foreground disabled:opacity-50"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (!isLastPage) setPage((p: number) => p + 1); }}
              disabled={isLastPage}
              className="rounded-md border border-border px-1.5 py-1.5 text-foreground disabled:opacity-50"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={!hasAllAnswers || sending}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleSubmit(); }}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send size={12} />
          Reply
        </button>

        <button
          type="button"
          disabled={sending}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDismiss(); }}
          className={cn(
            "flex items-center rounded-md border border-border px-1.5 py-1.5 text-xs transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-red-400",
            sending && "opacity-50",
          )}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
