import { memo } from 'react';
import { gql } from '@apollo/client';
import type { TicketStatus } from '../types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useKanbanStore } from '../stores/kanbanStore';
import { WORKSPACE_FIELDS } from '../graphql/fragments';
import { useGetWorkspaceQuery } from './__generated__/ThreadLinkPreview.generated';
import { STATUS_CONFIG } from './MessageItem';

const _GQL_GET_WORKSPACE = gql`
  query GetWorkspace($id: ID!) {
    workspace(id: $id) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

interface ThreadLinkPreviewProps {
  channelId: string;
  workspaceId: string;
  onNavigate: (channelId: string, workspaceId: string) => void;
}

export const ThreadLinkPreview = memo(function ThreadLinkPreview({
  channelId,
  workspaceId,
  onNavigate,
}: ThreadLinkPreviewProps) {
  // Fast path: workspace is in the current channel's store
  const localWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId),
  );
  const ticket = useKanbanStore((s) => {
    for (const col of s.columns) {
      const found = col.tickets.find((t) => t.workspaceId === workspaceId);
      if (found) return found;
    }
    return null;
  });

  // Slow path: fetch single workspace by ID (skipped if already in store)
  const { data, loading } = useGetWorkspaceQuery({
    variables: { id: workspaceId },
    skip: !!localWorkspace,
  });

  const workspace = localWorkspace ?? data?.workspace;

  if (!workspace && loading) {
    return (
      <div className="my-1 inline-block rounded-lg border border-[#292e42] bg-[#1f2335] px-3 py-2 text-xs text-[#565f89]">
        Loading thread...
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="my-1 inline-block rounded-lg border border-[#292e42] bg-[#1f2335] px-3 py-2 text-xs text-[#565f89]">
        Thread not found
      </div>
    );
  }

  const status = (workspace.status ?? 'pending') as TicketStatus;
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const title = ticket?.title || workspace.preview || workspace.cliSessionId;
  const branch = workspace.branch?.replace(/^trace\//, '');

  return (
    <button
      type="button"
      onClick={() => onNavigate(channelId, workspaceId)}
      className="my-1 flex w-full max-w-sm cursor-pointer items-center gap-2.5 rounded-lg border border-[#292e42] bg-[#1f2335] px-3 py-2 text-left transition-colors hover:border-violet-400/30 hover:bg-[#1f2335]/80"
    >
      {/* Status dot */}
      <div className={`h-2 w-2 flex-shrink-0 rounded-full ${config.color} bg-current`} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-[#c0caf5]">{title}</div>
        {branch && (
          <div className="truncate font-mono text-[10px] text-[#565f89]">{branch}</div>
        )}
      </div>

      {/* Status badge */}
      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color} ${config.bgColor}`}>
        {config.label}
      </span>
    </button>
  );
});
