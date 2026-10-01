export function DiffGapRow({
  label,
  position,
  onExpand,
  loading = false,
}: {
  label: string;
  position: "between" | "end";
  onExpand?(): void;
  loading?: boolean;
}) {
  const className =
    position === "end"
      ? "flex h-7 items-center rounded-b-[9px] border-t border-[var(--th-edge-faint)] bg-[var(--th-accent)]/[0.05] pl-16 text-[11.5px] text-[var(--th-code-comment)]"
      : "flex h-[26px] items-center bg-[var(--th-accent)]/[0.05] pl-16 text-[11.5px] text-[var(--th-code-comment)]";

  return (
    <div className={className}>
      {onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          disabled={loading}
          aria-label={`Show ${label}`}
          className="rounded px-1 text-left hover:bg-[var(--th-accent)]/10 hover:text-[var(--th-primary)] disabled:cursor-wait"
        >
          ⋯ {loading ? "Loading unchanged lines…" : label}
        </button>
      ) : (
        <>⋯ {label}</>
      )}
    </div>
  );
}
