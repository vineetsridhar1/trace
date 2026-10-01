export function ReviewLoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 bg-[var(--th-review-canvas)] p-[18px]">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="h-[30px] animate-pulse rounded-[7px] bg-gradient-to-r from-[var(--th-edge-faint)] via-[var(--th-review-edge-mid)] to-[var(--th-edge-faint)]" />
      {[80, 62, 72, 45].map((width) => (
        <div
          key={width}
          style={{ width: `${width}%` }}
          className="h-[9px] rounded bg-[var(--th-edge-faint)]"
        />
      ))}
    </div>
  );
}
