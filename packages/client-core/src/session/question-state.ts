import { useCallback, useMemo, useState } from "react";
import type { Question } from "@trace/shared";

interface QuestionNode {
  questions: Question[];
}

const EMPTY_REFERENCE_VALUES: Readonly<Record<number, readonly string[]>> = {};

function optionValue(question: Question, index: number): string {
  const option = question.options[index];
  return option?.id ?? option?.label ?? "";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function responseForTraceQuestion(
  question: Question,
  selected: ReadonlySet<string>,
  custom: string,
  ranking: readonly string[],
  references: readonly string[],
  assumed: boolean,
): string {
  const id = escapeXml(question.id ?? question.header ?? "question");
  const values = question.type === "ranking" ? ranking : [...selected];
  const referenceText = [custom, ...references].filter(Boolean).join("\n");
  const body = assumed
    ? "  <assumption>you-decide</assumption>"
    : referenceText
      ? `  <text>${escapeXml(referenceText)}</text>`
      : values.map((value) => `  <selected>${escapeXml(value)}</selected>`).join("\n");
  return `<trace:input-response id="${id}">\n${body}\n</trace:input-response>`;
}

/** Shared state machine for native and trace-protocol question sets. */
export function useQuestionState(
  node: QuestionNode,
  referenceValues: Readonly<Record<number, readonly string[]>> = EMPTY_REFERENCE_VALUES,
) {
  const total = node.questions.length;
  const [page, setPage] = useState(0);
  const [selections, setSelections] = useState<Record<number, Set<string>>>({});
  const [customTexts, setCustomTexts] = useState<Record<number, string>>({});
  const [rankings, setRankings] = useState<Record<number, string[]>>(() => {
    const initial: Record<number, string[]> = {};
    node.questions.forEach((question, index) => {
      if (question.type === "ranking") {
        initial[index] = question.options.map((_, optionIndex) =>
          optionValue(question, optionIndex),
        );
      }
    });
    return initial;
  });
  const [assumptions, setAssumptions] = useState<Set<number>>(() => new Set());

  const question = node.questions[page] ?? {
    question: "",
    header: "",
    options: [],
    multiSelect: false,
  };
  const currentSelected = selections[page] ?? new Set<string>();
  const currentCustom = customTexts[page] ?? "";
  const currentRanking = rankings[page] ?? [];
  const isLastPage = page === total - 1;
  const isFirstPage = page === 0;

  const answerState = useMemo(
    () =>
      node.questions.map((candidate, index) => {
        const selected = selections[index] ?? new Set<string>();
        const custom = (customTexts[index] ?? "").trim();
        const assumed = assumptions.has(index);
        const ranking = rankings[index] ?? [];
        const references = referenceValues[index] ?? [];
        const type = candidate.type ?? (candidate.multiSelect ? "multi-select" : "single-select");
        const otherNeedsText =
          (type === "select-with-other" || candidate.other) && selected.has("other");
        const invalidOther = otherNeedsText && custom.length === 0;
        const count =
          candidate.type === "ranking" ? ranking.length : selected.size - (invalidOther ? 1 : 0);
        const answered =
          assumed ||
          custom.length > 0 ||
          (type === "reference" && references.length > 0) ||
          ((type === "ranking" || type === "confirm" || type.includes("select")) && count > 0);
        const belowMin = candidate.min != null && count < candidate.min;
        const aboveMax = candidate.max != null && count > candidate.max;
        return {
          answered,
          valid: answered && !belowMin && !aboveMax,
          selected,
          custom,
          ranking,
          references,
          assumed,
        };
      }),
    [assumptions, customTexts, node.questions, rankings, referenceValues, selections],
  );

  const hasAllAnswers = answerState.length > 0 && answerState.every((answer) => answer.valid);
  const currentAnswer = answerState[page];
  const currentType = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const currentOtherNeedsText =
    (currentType === "select-with-other" || question.other) && currentSelected.has("other");
  const validationMessage =
    currentOtherNeedsText && currentCustom.trim().length === 0
      ? "Describe your alternative."
      : question.min != null && currentSelected.size < question.min
        ? `Pick at least ${question.min}.`
        : question.max != null && currentSelected.size > question.max
          ? `Pick no more than ${question.max}.`
          : null;

  const toggleOption = useCallback(
    (value: string) => {
      setAssumptions((current) => {
        const next = new Set(current);
        next.delete(page);
        return next;
      });
      if (question.type === "select-with-other" || question.other) {
        setCustomTexts((current) => ({ ...current, [page]: "" }));
      }
      setSelections((previous) => {
        const current = previous[page] ?? new Set<string>();
        const next = new Set(current);
        const multi = question.multiSelect || question.type === "multi-select";
        if (multi) {
          if (next.has(value)) next.delete(value);
          else if (question.max == null || next.size < question.max) next.add(value);
        } else if (next.has(value)) {
          next.clear();
        } else {
          next.clear();
          next.add(value);
        }
        return { ...previous, [page]: next };
      });
    },
    [page, question.max, question.multiSelect, question.other, question.type],
  );

  const setCustomText = useCallback(
    (text: string) => {
      setAssumptions((current) => {
        const next = new Set(current);
        next.delete(page);
        return next;
      });
      setCustomTexts((previous) => ({ ...previous, [page]: text }));
    },
    [page],
  );

  const decideForMe = useCallback(() => {
    setAssumptions((current) => new Set(current).add(page));
    setSelections((current) => ({ ...current, [page]: new Set() }));
    setCustomTexts((current) => ({ ...current, [page]: "" }));
  }, [page]);

  const moveRankOption = useCallback(
    (value: string, direction: -1 | 1) => {
      setRankings((current) => {
        const order = [...(current[page] ?? [])];
        const from = order.indexOf(value);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= order.length) return current;
        [order[from], order[to]] = [order[to]!, order[from]!];
        return { ...current, [page]: order };
      });
    },
    [page],
  );

  const goNext = useCallback(() => setPage((current) => Math.min(total - 1, current + 1)), [total]);
  const goPrev = useCallback(() => setPage((current) => Math.max(0, current - 1)), []);

  const buildResponse = useCallback(
    (currentPageCustomOverride?: string): string | null => {
      const responses: string[] = [];
      node.questions.forEach((candidate, index) => {
        const state = answerState[index];
        if (!state?.answered) return;
        const custom =
          index === page && currentPageCustomOverride !== undefined
            ? currentPageCustomOverride.trim()
            : state.custom;
        if (candidate.protocol === "trace") {
          responses.push(
            responseForTraceQuestion(
              candidate,
              state.selected,
              custom,
              state.ranking,
              state.references,
              state.assumed,
            ),
          );
          return;
        }
        const selectedLabels = candidate.options
          .filter((option, optionIndex) =>
            state.selected.has(option.id ?? option.label ?? optionValue(candidate, optionIndex)),
          )
          .map((option) => option.label);
        const referenceText = [custom, ...state.references].filter(Boolean).join(", ");
        const value = state.assumed
          ? "You decide"
          : referenceText || selectedLabels.join(", ") || state.ranking.join(", ");
        responses.push(`${candidate.header}: ${value}`);
      });
      return responses.length > 0 ? responses.join("\n") : null;
    },
    [answerState, node.questions, page],
  );

  return {
    page,
    setPage,
    total,
    question,
    currentSelected,
    currentCustom,
    currentRanking,
    currentAnswered: currentAnswer?.answered ?? false,
    currentValid: currentAnswer?.valid ?? false,
    answers: answerState,
    validationMessage,
    isFirstPage,
    isLastPage,
    hasAllAnswers,
    toggleOption,
    setCustomText,
    decideForMe,
    moveRankOption,
    goNext,
    goPrev,
    buildResponse,
  };
}
