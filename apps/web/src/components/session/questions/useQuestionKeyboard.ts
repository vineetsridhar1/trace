import { useEffect } from "react";
import type { Question } from "@trace/shared";

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("button, input, textarea, select, a, [role='button']") !== null)
  );
}

export function useQuestionKeyboard({
  disabled,
  reviewing,
  question,
  type,
  onDismiss,
  onSend,
  onAdvance,
  onToggle,
}: {
  disabled: boolean;
  reviewing: boolean;
  question: Question;
  type: string;
  onDismiss: () => void;
  onSend: () => void;
  onAdvance: () => void;
  onToggle: (value: string) => void;
}) {
  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      } else if (reviewing && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSend();
      } else if (!reviewing && event.key === "Enter" && !isInteractive(event.target)) {
        event.preventDefault();
        onAdvance();
      } else if (!reviewing && !isInteractive(event.target) && /^[1-9]$/.test(event.key)) {
        const option = question.options[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          onToggle(option.id ?? option.label);
        }
      } else if (
        !reviewing &&
        !isInteractive(event.target) &&
        type === "confirm" &&
        /^(y|n)$/i.test(event.key)
      ) {
        const index = event.key.toLowerCase() === "y" ? 0 : 1;
        const option = question.options[index];
        event.preventDefault();
        onToggle(option?.id ?? option?.label ?? (index === 0 ? "yes" : "no"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, onAdvance, onDismiss, onSend, onToggle, question.options, reviewing, type]);
}
