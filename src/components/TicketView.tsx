import { useState, useEffect } from 'react';
import { gql } from '@apollo/client';
import { FiExternalLink, FiLink, FiChevronDown, FiChevronRight, FiFile, FiCheckCircle, FiAlertTriangle, FiCpu, FiHelpCircle } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KanbanTicket, SemanticContext } from '../types';
import { getServerUrl, getTicketMetadata } from '../types';
import { ImageLightbox } from './ImageLightbox';
import { useTicketDependenciesLazyQuery } from './__generated__/TicketView.generated';
import { ScrambleText } from './ScrambleText';

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
  in_progress: { label: 'In Progress', className: 'text-accent-light bg-accent-light/10' },
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

function CollapsibleSection({
  title,
  icon,
  badge,
  badgeClassName,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeClassName?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#565f89] hover:text-[#7aa2f7] transition-colors"
      >
        {open ? <FiChevronDown className="h-3 w-3 shrink-0" /> : <FiChevronRight className="h-3 w-3 shrink-0" />}
        {icon}
        <span>{title}</span>
        {badge != null && (
          <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-medium ${badgeClassName ?? 'bg-[#1f2335] text-[#a9b1d6]'}`}>
            {badge}
          </span>
        )}
      </button>
      {open && <div className="mt-1.5 pl-5">{children}</div>}
    </div>
  );
}

/** Coerce an AI-returned value to a display string (it may be an object like {summary: "..."}) */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.summary === 'string') return v.summary;
    if (typeof v.text === 'string') return v.text;
    return JSON.stringify(value);
  }
  return String(value);
}

function SemanticSections({ semantic }: { semantic: SemanticContext }) {
  const hasChanges = semantic.keyChanges && semantic.keyChanges.length > 0;
  const hasDecisions = semantic.decisions && semantic.decisions.length > 0;
  const hasTradeoffs = semantic.tradeoffs && semantic.tradeoffs.length > 0;
  const hasTechnical = semantic.technicalContext && semantic.technicalContext.length > 0;
  const hasBlockers = semantic.blockers && semantic.blockers.length > 0;

  if (!hasChanges && !hasDecisions && !hasTradeoffs && !hasTechnical && !hasBlockers) {
    return null;
  }

  return (
    <div className="mb-4 border-t border-[#292e42] pt-3">
      {hasChanges && (
        <CollapsibleSection
          title="Changes"
          icon={<FiFile className="h-3 w-3 shrink-0" />}
          badge={semantic.keyChanges!.length}
          defaultOpen
        >
          <div className="space-y-1.5">
            {semantic.keyChanges!.map((change, i) => (
              <div key={i} className="text-sm text-[#a9b1d6]">
                <span className="font-mono text-xs text-[#7aa2f7]">{toText(change.file)}</span>
                <p className="mt-0.5 text-xs text-[#787c99] leading-relaxed">{toText(change.summary)}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {hasDecisions && (
        <CollapsibleSection
          title="Decisions"
          icon={<FiCheckCircle className="h-3 w-3 shrink-0" />}
          badge={semantic.decisions!.length}
          defaultOpen
        >
          <ul className="space-y-1">
            {semantic.decisions!.map((d, i) => (
              <li key={i} className="text-xs leading-relaxed text-[#a9b1d6]">
                <span className="mr-1.5 text-[#565f89]">&bull;</span>{toText(d)}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {hasTradeoffs && (
        <CollapsibleSection
          title="Tradeoffs"
          icon={<FiAlertTriangle className="h-3 w-3 shrink-0" />}
          badge={semantic.tradeoffs!.length}
        >
          <ul className="space-y-1">
            {semantic.tradeoffs!.map((t, i) => (
              <li key={i} className="text-xs leading-relaxed text-[#a9b1d6]">
                <span className="mr-1.5 text-[#565f89]">&bull;</span>{toText(t)}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {hasTechnical && (
        <CollapsibleSection
          title="Technical Context"
          icon={<FiCpu className="h-3 w-3 shrink-0" />}
          badge={semantic.technicalContext!.length}
        >
          <ul className="space-y-1">
            {semantic.technicalContext!.map((t, i) => (
              <li key={i} className="text-xs leading-relaxed text-[#a9b1d6]">
                <span className="mr-1.5 text-[#565f89]">&bull;</span>{toText(t)}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {hasBlockers && (
        <CollapsibleSection
          title="Blockers"
          icon={<FiHelpCircle className="h-3 w-3 shrink-0" />}
          badge={semantic.blockers!.length}
          badgeClassName="bg-red-400/10 text-red-400"
          defaultOpen
        >
          <ul className="space-y-1">
            {semantic.blockers!.map((b, i) => (
              <li key={i} className="text-xs leading-relaxed text-red-300/80">
                <span className="mr-1.5 text-red-400/50">&bull;</span>{toText(b)}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}

export function TicketView({ ticket }: { ticket: KanbanTicket }) {
  const statusConfig = STATUS_CONFIG[ticket.workspace?.status ?? ''] ?? STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.pending;
  const attachments = ticket.workspace?.attachments ?? [];
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [fetchDeps, { data: depsData }] = useTicketDependenciesLazyQuery();
  const meta = getTicketMetadata(ticket);

  useEffect(() => {
    if (ticket.workspace?.status === 'queued' && ticket.workspaceId) {
      void fetchDeps({ variables: { workspaceId: ticket.workspaceId } });
    }
  }, [ticket.workspaceId, ticket.workspace?.status, fetchDeps]);

  const deps = depsData?.ticketDependencies ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <h2 className="mb-3 text-lg font-semibold text-primary"><ScrambleText text={ticket.title} /></h2>

      <div className="mb-4 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusConfig.className}`}>
          {statusConfig.label}
        </span>
        {ticket.workspace?.branch && (
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[11px] text-accent">
            {ticket.workspace.branch}
          </span>
        )}
        {ticket.workspace?.prUrl && (
          <button
            type="button"
            onClick={() => window.open(ticket.workspace!.prUrl!, '_blank')}
            className="inline-flex items-center gap-1 rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-surface-elevated transition-colors"
          >
            PR
            <FiExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {deps.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <FiLink className="mr-1 inline h-3 w-3" />
            Waiting On
          </h4>
          <div className="space-y-1">
            {deps.map((dep) => (
              <div key={dep.id} className="flex items-center gap-2 rounded bg-surface-elevated px-2 py-1.5 text-sm text-primary">
                <span className="truncate">{dep.dependsOnTicketTitle ?? dep.dependsOnWorkspaceId}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ticket.description && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Description
          </h4>
          <div className="markdown-body text-sm leading-relaxed text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.description}</ReactMarkdown>
          </div>
        </div>
      )}

      {ticket.solutionApproach && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Solution Approach
          </h4>
          <div className="markdown-body text-sm leading-relaxed text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ticket.solutionApproach}</ReactMarkdown>
          </div>
        </div>
      )}

      {meta.semanticContext && <SemanticSections semantic={meta.semanticContext} />}

      {ticket.metadata != null && (() => {
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
                className="rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        );
      })()}

      {attachments.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Attachments
          </h4>
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setLightboxSrc(`${getServerUrl()}${a.url}`)}
                className="h-16 w-16 overflow-hidden rounded-md border border-edge-hover transition-colors hover:border-accent"
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
