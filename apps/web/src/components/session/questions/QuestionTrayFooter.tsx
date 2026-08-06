export function QuestionTrayFooter({
  reviewing,
  total,
  disabled,
  sending,
  backDisabled,
  onPrimary,
  onBack,
}: {
  reviewing: boolean;
  total: number;
  disabled: boolean;
  sending: boolean;
  backDisabled: boolean;
  onPrimary: () => void;
  onBack: () => void;
}) {
  const primary = sending
    ? "Sending…"
    : reviewing
      ? `Send ${total} answer${total === 1 ? "" : "s"}`
      : "Next";
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        aria-label="Go to previous question"
        disabled={backDisabled}
        onClick={onBack}
        className="min-h-9 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        Back
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onPrimary}
        className="min-h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:border disabled:border-border disabled:bg-transparent disabled:text-muted-foreground"
      >
        {primary}
      </button>
    </div>
  );
}
