import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MARKDOWN_COMPONENTS } from '@trace/shared-ui';
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
      <div className="rounded-lg border border-dashed border-accent/30 bg-accent/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-accent-light">Plan Review</span>
          <span className="text-xs text-muted">{time}</span>
        </div>

        {node.planContent ? (
          <div className="markdown-body min-w-0 overflow-hidden text-sm text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{node.planContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-muted">No plan content available.</div>
        )}
      </div>
    </div>
  );
});
