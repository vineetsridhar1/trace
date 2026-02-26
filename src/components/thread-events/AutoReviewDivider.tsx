import { memo } from 'react';

export const AutoReviewDivider = memo(function AutoReviewDivider({ time }: { time: string }) {
  return (
    <div className="my-3 flex items-center gap-3 px-2">
      <div className="h-px flex-1 bg-teal-500/20" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-teal-400/60">
        Beginning Auto-Review
      </span>
      <div className="h-px flex-1 bg-teal-500/20" />
    </div>
  );
});
