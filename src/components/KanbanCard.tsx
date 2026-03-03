import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FiGitPullRequest, FiLink, FiTrash2 } from 'react-icons/fi';
import type { KanbanTicket } from '../types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { formatTime } from '../utils';
import { CopyableBranch } from './CopyableBranch';
import { ScrambleText } from './ScrambleText';

interface KanbanCardProps {
  ticket: KanbanTicket;
  onClickTicket: (workspaceId: string) => void;
  onDragStart: (ticketId: string) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
}

export const KanbanCard = memo(function KanbanCard({
  ticket,
  onClickTicket,
  onDragStart,
  onDeleteWorkspace,
}: KanbanCardProps) {
  const ciStatus = useWorkspaceStore((s) => s.ciStatuses[ticket.workspaceId] ?? null);
  const prUrl = ticket.workspace?.prUrl ?? null;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', ticket.id);
        onDragStart(ticket.id);
      }}
      onClick={() => onClickTicket(ticket.workspaceId)}
      className="group relative cursor-pointer rounded-md border border-[#292e42] bg-[#1f2335] p-3 transition-all hover:border-[#3b4261] hover:bg-[#24283b] active:scale-[0.98]"
    >
      {onDeleteWorkspace && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteWorkspace(ticket.workspaceId);
          }}
          className="absolute top-2 right-2 hidden rounded p-1 text-[#565f89] transition-colors hover:bg-red-500/20 hover:text-red-400 group-hover:block"
        >
          <FiTrash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <h4 className="line-clamp-2 text-sm font-medium text-[#c0caf5]"><ScrambleText text={ticket.title} /></h4>

      {ticket.workspace.status === 'queued' && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-cyan-400">
          <FiLink className="h-3 w-3" />
          <span>Queued</span>
        </div>
      )}

      {ticket.description && (
        <div className="markdown-body mt-1 line-clamp-2 text-xs text-[#565f89]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.description}</ReactMarkdown>
        </div>
      )}

      {ticket.solutionApproach && (
        <div className="mt-1.5 line-clamp-1 text-xs text-[#7aa2f7]/70">
          <span className="mr-1">&#9672;</span>
          <span className="markdown-body inline"><ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.solutionApproach}</ReactMarkdown></span>
        </div>
      )}

      {(() => {
        const meta = ticket.metadata as { tags?: string[] } | null;
        if (!meta) return null;
        const hasTags = Array.isArray(meta.tags) && meta.tags.length > 0;
        if (!hasTags) return null;
        return (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {(meta.tags as string[]).map((tag) => (
              <span
                key={tag}
                className="rounded px-1.5 py-0.5 text-[10px] text-[#565f89]"
              >
                {tag}
              </span>
            ))}
          </div>
        );
      })()}

      <div className="relative mt-2 flex items-center gap-2">
        {ticket.workspace.branch && (
          <CopyableBranch branch={ticket.workspace.branch} />
        )}
        {prUrl && (() => {
          const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
          let colorClass = 'text-green-400 border-green-400/50';
          if (ciStatus) {
            if (ciStatus.failed > 0) colorClass = 'text-red-400 border-red-400/50';
            else if (ciStatus.pending > 0) colorClass = 'text-yellow-400 border-yellow-400/50';
            else if (ciStatus.total > 0 && ciStatus.passed === ciStatus.total) colorClass = 'text-green-400 border-green-400/50';
          }
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(prUrl, '_blank');
              }}
              className={`inline-flex items-center gap-1 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-white/5 ${colorClass}`}
            >
              <FiGitPullRequest className="h-2.5 w-2.5" />
              {prNumber ? `#${prNumber}` : 'PR'}
            </button>
          );
        })()}
        <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[#565f89]">
          {formatTime(ticket.createdAt)}
        </span>
      </div>
    </div>
  );
});
