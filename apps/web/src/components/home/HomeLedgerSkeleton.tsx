export function HomeLedgerSkeleton() {
  return (
    <section className="mx-auto mt-9 w-full max-w-[1020px]" aria-label="Loading your work">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="home-shimmer h-4 w-20 rounded" />
        <div className="home-shimmer ml-2 h-5 w-12 rounded-full" />
        <div className="home-shimmer h-5 w-16 rounded-full" />
        <div className="home-shimmer h-5 w-14 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-[10px] border border-[var(--th-edge)]">
        <div className="home-shimmer h-8 border-b border-[var(--th-edge-faint)]" />
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="flex h-14 items-center gap-3 border-b border-[var(--th-edge-faint)] px-4 last:border-0 md:h-10"
          >
            <div className="home-shimmer size-3.5 rounded" />
            <div
              className="home-shimmer h-2.5 rounded"
              style={{ width: `${220 + row * 34}px`, maxWidth: "34%" }}
            />
            <div className="home-shimmer ml-auto h-2.5 w-28 rounded" />
            <div className="home-shimmer size-5 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
