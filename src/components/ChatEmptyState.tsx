import { FiMessageSquare } from 'react-icons/fi';

export function ChatEmptyState({ channelName, channelCreatedAt }: { channelName: string; channelCreatedAt: string | null }) {
  const dateLabel = channelCreatedAt
    ? new Date(channelCreatedAt).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-primary">
          Welcome to #{channelName}
        </h3>
        <p className="mt-1 text-sm text-muted">
          This is the start of the <span className="font-medium text-primary">#{channelName}</span> channel. Use this space to collaborate with your team.
        </p>
      </div>

      {dateLabel && (
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-surface-elevated" />
          <span className="text-xs font-medium text-muted">{dateLabel}</span>
          <div className="h-px flex-1 bg-surface-elevated" />
        </div>
      )}

      <div className="flex items-center gap-2 py-1">
        <FiMessageSquare className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        <span className="text-sm text-muted">
          You joined <span className="font-medium">#{channelName}</span>
        </span>
      </div>
    </div>
  );
}
