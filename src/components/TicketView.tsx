import { useState, useEffect } from 'react';
import { gql } from '@apollo/client';
import { FiExternalLink, FiLink } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KanbanTicket } from '../types';
import { getServerUrl } from '../types';
import { ImageLightbox } from './ImageLightbox';
import { useTicketDependenciesLazyQuery } from './__generated__/TicketView.generated';

const GQL_TICKET_DEPENDENCIES = gql`
  query TicketDependencies($workspaceId: ID!) {
    ticketDependencies(workspaceId: $workspaceId) {
      id
      dependsOnWorkspaceId
      dependsOnTicketTitle
    }
  }
`;

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'text-yellow-400 bg-yellow-400/10' },
  in_progress: { label: 'In Progress', className: 'text-blue-400 bg-blue-400/10' },
  completed: { label: 'Done', className: 'text-green-400 bg-green-400/10' },
  merged: { label: 'Merged', className: 'text-purple-400 bg-purple-400/10' },
  needs_input: { label: 'Needs Input', className: 'text-amber-400 bg-amber-400/10' },
  queued: { label: 'Queued', className: 'text-cyan-400 bg-cyan-400/10' },
  review: { label: 'In Review', className: 'text-teal-400 bg-teal-400/10' },
};

const COMPLEXITY_CONFIG: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-green-400 bg-green-400/10' },
  medium: { label: 'Medium', className: 'text-yellow-400 bg-yellow-400/10' },
  high: { label: 'High', className: 'text-red-400 bg-red-400/10' },
};

export function TicketView({ ticket }: { ticket: KanbanTicket }) {
  const statusConfig = STATUS_CONFIG[ticket.workspace.status] ?? STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.pending;
  const attachments = ticket.workspace.attachments ?? [];
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [fetchDeps, { data: depsData }] = useTicketDependenciesLazyQuery();

  useEffect(() => {
    if (ticket.workspace.status === 'queued') {
      void fetchDeps({ variables: { workspaceId: ticket.workspaceId } });
    }
  }, [ticket.workspaceId, ticket.workspace.status, fetchDeps]);

  const deps = depsData?.ticketDependencies ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <h2 className="mb-3 text-lg font-semibold text-[#c0caf5]">{ticket.title}</h2>

      <div className="mb-4 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusConfig.className}`}>
          {statusConfig.label}
        </span>
        {ticket.workspace.branch && (
          <span className="rounded bg-[#1f2335] px-1.5 py-0.5 font-mono text-[11px] text-[#7aa2f7]">
            {ticket.workspace.branch}
          </span>
        )}
        {ticket.workspace.prUrl && (
          <button
            type="button"
            onClick={() => window.open(ticket.workspace.prUrl!, '_blank')}
            className="inline-flex items-center gap-1 rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] font-medium text-[#7aa2f7] hover:bg-[#292e42] transition-colors"
          >
            PR
            <FiExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {deps.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#565f89]">
            <FiLink className="mr-1 inline h-3 w-3" />
            Waiting On
          </h4>
          <div className="space-y-1">
            {deps.map((dep) => (
              <div key={dep.id} className="flex items-center gap-2 rounded bg-[#1f2335] px-2 py-1.5 text-sm text-[#a9b1d6]">
                <span className="truncate">{dep.dependsOnTicketTitle ?? dep.dependsOnWorkspaceId}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ticket.description && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#565f89]">
            Description
          </h4>
          <div className="markdown-body text-sm leading-relaxed text-[#a9b1d6]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.description}</ReactMarkdown>
          </div>
        </div>
      )}

      {ticket.solutionApproach && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#565f89]">
            Solution Approach
          </h4>
          <div className="markdown-body text-sm leading-relaxed text-[#a9b1d6]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.solutionApproach}</ReactMarkdown>
          </div>
        </div>
      )}

      {ticket.metadata != null && (() => {
        const meta = ticket.metadata as { tags?: string[]; complexity?: string };
        const hasTags = Array.isArray(meta.tags) && meta.tags.length > 0;
        const complexityConfig = meta.complexity ? COMPLEXITY_CONFIG[meta.complexity] : null;
        if (!hasTags && !complexityConfig) return null;
        return (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {complexityConfig && (
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${complexityConfig.className}`}>
                {complexityConfig.label} complexity
              </span>
            )}
            {hasTags && (meta.tags as string[]).map((tag) => (
              <span
                key={tag}
                className="rounded bg-[#1f2335] px-1.5 py-0.5 text-[11px] font-medium text-[#a9b1d6]"
              >
                {tag}
              </span>
            ))}
          </div>
        );
      })()}

      {attachments.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#565f89]">
            Attachments
          </h4>
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setLightboxSrc(`${getServerUrl()}${a.url}`)}
                className="h-16 w-16 overflow-hidden rounded-md border border-[#3b4261] transition-colors hover:border-[#7aa2f7]"
              >
                <img
                  src={`${getServerUrl()}${a.url}`}
                  alt={a.filename}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Attached image" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
