function hint(type: string, reviewing: boolean): string {
  if (reviewing) return "⌘↵ send · esc type instead";
  if (type === "ranking") return "↑ ↓ reorder · ↵ continue · esc type instead";
  if (type === "reference") return "⌘V paste · ↵ continue · esc type instead";
  if (type === "confirm") return "y / n choose · esc type instead";
  return "number keys pick · ↵ continue · esc type instead";
}

export function QuestionTrayFooter({
  reviewing,
  total,
  page,
  type,
  disabled,
  onPrimary,
  onSecondary,
}: {
  reviewing: boolean;
  total: number;
  page: number;
  type: string;
  disabled: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const primary = reviewing
    ? `Send ${total} answer${total === 1 ? "" : "s"}`
    : page === total - 1
      ? `Review ${total} answer${total === 1 ? "" : "s"}`
      : `Answer & show question ${page + 2}`;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onPrimary}
          className="min-h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:border disabled:border-border disabled:bg-transparent disabled:text-muted-foreground"
        >
          {primary}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          className="min-h-9 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {reviewing ? `Back to question ${total}` : "You decide"}
        </button>
      </div>
      <span className="font-mono text-[9px] leading-3 text-muted-foreground">
        {hint(type, reviewing)}
      </span>
    </div>
  );
}
