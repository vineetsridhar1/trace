import { memo, useState, useCallback } from 'react';
import { FiCheck, FiX, FiEdit2 } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PlanReviewNode } from '../../types';
import { formatTime } from '../../utils';

export type PlanResponseMode = 'clear-context' | 'keep-context' | 'revise';

export interface PlanReviewActions {
  sendPlanResponse: (
    text: string,
    mode: PlanResponseMode,
    planContent?: string,
    planFilePath?: string,
  ) => Promise<void>;
}

export const PlanReview = memo(function PlanReview({
  node,
  actions,
}: {
  node: PlanReviewNode;
  actions?: PlanReviewActions;
}) {
  const time = formatTime(node.event.timestamp);
  const [submitting, setSubmitting] = useState(false);
  const [showReviseInput, setShowReviseInput] = useState(false);
  const [reviseText, setReviseText] = useState('');

  const handleApprove = useCallback(async () => {
    if (!actions) return;
    setSubmitting(true);
    try {
      await actions.sendPlanResponse(
        'Approved. Implement this plan.',
        'clear-context',
        node.planContent,
        node.planFilePath,
      );
    } finally {
      setSubmitting(false);
    }
  }, [actions, node.planContent, node.planFilePath]);

  const handleReject = useCallback(async () => {
    if (!actions) return;
    setSubmitting(true);
    try {
      await actions.sendPlanResponse(
        'This plan is rejected. Please stop.',
        'keep-context',
      );
    } finally {
      setSubmitting(false);
    }
  }, [actions]);

  const handleRevise = useCallback(async () => {
    if (!actions) return;
    const trimmed = reviseText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await actions.sendPlanResponse(trimmed, 'revise');
      setReviseText('');
      setShowReviseInput(false);
    } finally {
      setSubmitting(false);
    }
  }, [reviseText, actions]);

  return (
    <div className="px-4 py-2">
      <div className="rounded-lg border border-dashed border-accent/30 bg-accent/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-accent-light">Plan Review</span>
          <span className="text-xs text-muted">{time}</span>
        </div>

        {node.planContent ? (
          <div className="markdown-body min-w-0 overflow-hidden text-sm text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.planContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-muted">No plan content available.</div>
        )}

        {actions && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApprove}
                disabled={submitting}
                className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                <FiCheck size={14} />
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowReviseInput(!showReviseInput)}
                disabled={submitting}
                className="btn-secondary flex items-center gap-1.5 rounded-md border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
              >
                <FiEdit2 size={12} />
                Revise
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-md border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                <FiX size={14} />
                Reject
              </button>
            </div>

            {showReviseInput && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={reviseText}
                  onChange={(e) => setReviseText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleRevise();
                    }
                  }}
                  placeholder="Describe revisions..."
                  disabled={submitting}
                  className="flex-1 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-muted focus:border-accent/50 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleRevise}
                  disabled={submitting || !reviseText.trim()}
                  className="btn-primary rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
