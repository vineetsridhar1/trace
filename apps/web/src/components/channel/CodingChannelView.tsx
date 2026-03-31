import { useEffect, useCallback, useState } from "react";
import { Code, GitBranch } from "lucide-react";
import { gql } from "@urql/core";
import type { SessionGroup } from "@trace/gql";
import { useEntityStore, useEntityField } from "../../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { StartSessionDialog } from "./StartSessionDialog";
import { SessionsTable } from "./SessionsTable";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";
import { Skeleton } from "../ui/skeleton";

const SESSION_GROUPS_QUERY = gql`
  query SessionGroups($channelId: ID!) {
    sessionGroups(channelId: $channelId) {
      id
      name
      status
      prUrl
      worktreeDeleted
      channel {
        id
      }
      createdAt
      updatedAt
      sessions {
        id
        name
        agentStatus
        sessionStatus
        tool
        model
        hosting
        branch
        prUrl
        worktreeDeleted
        sessionGroupId
        connection {
          state
          runtimeInstanceId
          runtimeLabel
          lastError
          retryCount
          canRetry
          canMove
        }
        createdBy {
          id
          name
          avatarUrl
        }
        repo {
          id
          name
        }
        channel {
          id
        }
        createdAt
        updatedAt
      }
    }
  }
`;

export function CodingChannelView({ channelId }: { channelId: string }) {
  const channelName = useEntityField("channels", channelId, "name");
  const baseBranch = useEntityField("channels", channelId, "baseBranch") as string | null | undefined;
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const [loading, setLoading] = useState(true);
  const refreshTick = useUIStore((s) => s.refreshTick);

  const fetchSessionGroups = useCallback(async () => {
    const result = await client.query(SESSION_GROUPS_QUERY, { channelId }).toPromise();

    if (result.data?.sessionGroups) {
      const groups = result.data.sessionGroups as Array<SessionGroup & { id: string }>;
      const flattenedSessions = groups.flatMap((group) => group.sessions ?? []);

      upsertMany(
        "sessionGroups",
        groups.map((group) => ({
          ...group,
          // Cold-start approximation: server sorts by updatedAt, so use that
          // as the initial _sortTimestamp. Real-time events will refine this
          // to only reflect meaningful activity (status changes, messages).
          _sortTimestamp:
            group.sessions?.[0]?.updatedAt
            ?? group.updatedAt,
        })) as Array<SessionGroupEntity & { id: string }>,
      );
      upsertMany("sessions", flattenedSessions as Array<SessionEntity & { id: string }>);
    }

    setLoading(false);
  }, [channelId, upsertMany]);

  useEffect(() => {
    setLoading(true);
    fetchSessionGroups();
  }, [fetchSessionGroups, refreshTick]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <Code size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {channelName ?? "Channel"}
        </h2>
        {baseBranch && (
          <span className="flex items-center gap-1 rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs text-muted-foreground">
            <GitBranch size={12} />
            {baseBranch}
          </span>
        )}
        <ConnectionStatus />
        <StartSessionDialog channelId={channelId} />
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="space-y-1 px-4 pt-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex h-10 items-center gap-4 px-2">
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <Skeleton className="h-3.5 w-[40%]" />
                <Skeleton className="ml-auto h-3.5 w-[10%]" />
              </div>
            ))}
          </div>
        ) : (
          <SessionsTable channelId={channelId} />
        )}
      </div>
    </div>
  );
}
