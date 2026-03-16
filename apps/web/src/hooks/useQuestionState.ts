import { useCallback, useMemo, useState } from "react";
import type { Question } from "@trace/shared";

interface QuestionNode {
  questions: Question[];
}

export function useQuestionState(node: QuestionNode) {
  const total = node.questions.length;
  const [page, setPage] = useState(0);
  const [selections, setSelections] = useState<Record<number, Set<string>>>({});
  const [customTexts, setCustomTexts] = useState<Record<number, string>>({});

  const q = node.questions[page];
  const currentSelected = selections[page] ?? new Set<string>();
  const currentCustom = customTexts[page] ?? "";
  const isLastPage = page === total - 1;
  const isFirstPage = page === 0;

  const hasAllAnswers = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => {
        const sel = selections[i];
        const custom = (customTexts[i] ?? "").trim();
        return (sel && sel.size > 0) || custom.length > 0;
      }).every(Boolean),
    [total, selections, customTexts],
  );

  const toggleOption = useCallback(
    (label: string) => {
      setSelections((prev) => {
        const current = prev[page] ?? new Set<string>();
        const next = new Set(current);
        if (q.multiSelect) {
          if (next.has(label)) next.delete(label);
          else next.add(label);
        } else {
          if (next.has(label)) next.clear();
          else {
            next.clear();
            next.add(label);
          }
        }
        return { ...prev, [page]: next };
      });
    },
    [page, q.multiSelect],
  );

  const setCustomText = useCallback(
    (text: string) => {
      setCustomTexts((prev) => ({ ...prev, [page]: text }));
    },
    [page],
  );

  const goNext = useCallback(() => {
    if (!isLastPage) setPage((p) => p + 1);
  }, [isLastPage]);

  const goPrev = useCallback(() => {
    if (!isFirstPage) setPage((p) => p - 1);
  }, [isFirstPage]);

  const buildResponse = useCallback((): string | null => {
    const parts: string[] = [];
    for (let i = 0; i < total; i++) {
      const qi = node.questions[i];
      const selected = selections[i];
      const custom = (customTexts[i] ?? "").trim();
      if (custom) {
        parts.push(`${qi.header}: ${custom}`);
      } else if (selected && selected.size > 0) {
        parts.push(`${qi.header}: ${[...selected].join(", ")}`);
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }, [total, node.questions, selections, customTexts]);

  return {
    page,
    total,
    question: q,
    currentSelected,
    currentCustom,
    isFirstPage,
    isLastPage,
    hasAllAnswers,
    toggleOption,
    setCustomText,
    goNext,
    goPrev,
    buildResponse,
  };
}
