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
        <h3 className="text-lg font-bold text-[#c0caf5]">
          Welcome to #{channelName}
        </h3>
        <p className="mt-1 text-sm text-[#565f89]">
          This is the start of the <span className="font-medium text-[#a9b1d6]">#{channelName}</span> channel. Use this space to collaborate with your team.
        </p>
      </div>

      {dateLabel && (
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#292e42]" />
          <span className="text-xs font-medium text-[#565f89]">{dateLabel}</span>
          <div className="h-px flex-1 bg-[#292e42]" />
        </div>
      )}

      <div className="flex items-center gap-2 py-1">
        <FiMessageSquare className="h-3.5 w-3.5 text-[#565f89]" aria-hidden="true" />
        <span className="text-sm text-[#565f89]">
          You joined <span className="font-medium">#{channelName}</span>
        </span>
      </div>
    </div>
  );
}
