import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PlanReviewNode } from '../../types';
import { formatTime } from '../../utils';

export const PlanReview = memo(function PlanReview({
  node,
}: {
  node: PlanReviewNode;
}) {
  const time = formatTime(node.event.timestamp);

  return (
    <div className="px-4 py-2">
      <div className="rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-violet-300">Plan Review</span>
          <span className="text-xs text-[#565f89]">{time}</span>
        </div>

        {node.planContent ? (
          <div className="markdown-body text-sm text-[#c0caf5]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.planContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-[#565f89]">No plan content available.</div>
        )}
      </div>
    </div>
  );
});
