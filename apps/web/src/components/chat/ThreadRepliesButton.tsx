import type { Actor } from "@trace/gql";
import { formatRelativeTime } from "./message-utils";

export function ThreadRepliesButton({
  replyCount,
  latestTimestamp,
  repliers,
  onClick,
}: {
  replyCount: number;
  latestTimestamp: string;
  repliers: Actor[];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="-ml-3 flex w-full cursor-pointer items-center gap-2 rounded-md pl-3 pr-3 py-1.5 hover:bg-surface-elevated/50"
    >
      <div className="flex -space-x-1.5">
        {repliers.map((replier, i) =>
          replier.avatarUrl ? (
            <img
              key={`${replier.type}:${replier.id}:${i}`}
              src={replier.avatarUrl}
              alt={replier.name ?? ""}
              className="h-6 w-6 rounded-md border-2 border-background"
            />
          ) : (
            <div
              key={`${replier.type}:${replier.id}:${i}`}
              className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground"
            >
              {replier.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          ),
        )}
      </div>
      <span className="text-[13px] font-bold text-blue-400 hover:underline">
        {replyCount} {replyCount === 1 ? "reply" : "replies"}
      </span>
      <span className="text-xs text-muted-foreground">{formatRelativeTime(latestTimestamp)}</span>
    </button>
  );
}
