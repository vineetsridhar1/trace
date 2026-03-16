export function QuestionOptionPill({
  label,
  description,
  selected,
  multiSelect,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  multiSelect: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={description}
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        selected
          ? "border-accent bg-accent/20 text-accent"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
      }`}
    >
      {multiSelect ? (
        <span
          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
            selected ? "border-accent bg-accent" : "border-muted-foreground"
          }`}
        >
          {selected && (
            <svg
              className="h-2.5 w-2.5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
      ) : (
        <span
          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-accent" : "border-muted-foreground"
          }`}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </span>
      )}
      {label}
    </button>
  );
}
