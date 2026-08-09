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
    <div className="flex items-center justify-end gap-2 max-md:gap-3">
      <button
        type="button"
        aria-label="Go to previous question"
        disabled={backDisabled}
        onClick={onBack}
        className="min-h-9 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-[52px] max-md:px-3 max-md:text-[13px]"
      >
        Back
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onPrimary}
        className="min-h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:border disabled:border-border disabled:bg-transparent disabled:text-muted-foreground max-md:min-h-[52px] max-md:flex-1 max-md:rounded-full max-md:text-[17px] max-md:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18),0_8px_24px_rgb(0_0_0_/_0.2)]"
      >
        {primary}
      </button>
    </div>
  );
}
