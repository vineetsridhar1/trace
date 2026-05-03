export function SystemBadge({ text }: { text: string }) {
  return (
    <div className="flex justify-center px-3 py-2">
      <span className="max-w-full rounded-full bg-surface-deep px-3 py-1 text-center text-[11px] text-muted-foreground">
        {text}
      </span>
    </div>
  );
}
