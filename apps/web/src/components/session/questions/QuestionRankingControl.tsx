import { GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import type { Question } from "@trace/shared";

export function QuestionRankingControl({
  question,
  ranking,
  onMove,
}: {
  question: Question;
  ranking: readonly string[];
  onMove: (value: string, direction: -1 | 1) => void;
}) {
  const options = new Map(question.options.map((option) => [option.id ?? option.label, option]));
  return (
    <div className="grid gap-1.5">
      {ranking.map((value, index) => {
        const option = options.get(value);
        return (
          <div
            key={value}
            className="flex min-h-10 items-center gap-3 rounded-lg border border-border px-3 py-1.5"
          >
            <GripVertical size={14} className="text-muted-foreground" />
            <span className="grid h-5 w-5 place-items-center rounded border border-foreground/30 bg-foreground/[0.08] font-mono text-[10px] font-semibold">
              {index + 1}
            </span>
            <span className="text-[13px] font-medium">{option?.label ?? value}</span>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                aria-label={`Move ${option?.label ?? value} up`}
                disabled={index === 0}
                onClick={() => onMove(value, -1)}
                className="grid h-6 w-6 place-items-center rounded border border-border text-muted-foreground disabled:opacity-30"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                aria-label={`Move ${option?.label ?? value} down`}
                disabled={index === ranking.length - 1}
                onClick={() => onMove(value, 1)}
                className="grid h-6 w-6 place-items-center rounded border border-border text-muted-foreground disabled:opacity-30"
              >
                <ChevronDown size={12} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
