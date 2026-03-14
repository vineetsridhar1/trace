export function SystemBadge({ text }: { text: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="text-[11px] text-muted-foreground bg-surface-deep px-3 py-1 rounded-full">
        {text}
      </span>
    </div>
  );
}
