export function ReviewLoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 bg-[#141414] p-[18px]">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="h-[30px] animate-pulse rounded-[7px] bg-gradient-to-r from-[#1f1f23] via-[#2a2a2f] to-[#1f1f23]" />
      {[80, 62, 72, 45].map((width) => (
        <div key={width} style={{ width: `${width}%` }} className="h-[9px] rounded bg-[#1f1f23]" />
      ))}
    </div>
  );
}
