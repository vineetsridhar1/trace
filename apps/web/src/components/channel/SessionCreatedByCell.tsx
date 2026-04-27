import { UserProfileChatCard } from "../shared/UserProfileChatCard";
import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionCreatedBy } from "./session-cell-data";

export function SessionCreatedByCell({ row }: { row?: SessionGroupRow }) {
  const createdBy = getSessionCreatedBy(row);
  if (!createdBy) return null;

  return (
    <UserProfileChatCard
      userId={createdBy.id}
      fallbackName={createdBy.name}
      fallbackAvatarUrl={createdBy.avatarUrl}
    >
      <div className="flex h-full cursor-pointer items-center gap-1.5">
        {createdBy.avatarUrl && (
          <img src={createdBy.avatarUrl} alt={createdBy.name} className="h-4 w-4 rounded-full" />
        )}
        <span className="truncate text-xs text-muted-foreground hover:underline">
          {createdBy.name}
        </span>
      </div>
    </UserProfileChatCard>
  );
}
