export function QuestionTrayFooter({
  reviewing,
  total,
  disabled,
  onPrimary,
  onSecondary,
}: {
  reviewing: boolean;
  total: number;
  disabled: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const primary = reviewing ? `Send ${total} answer${total === 1 ? "" : "s"}` : "Next";
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onSecondary}
        className="min-h-9 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {reviewing ? `Back to question ${total}` : "You decide"}
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
