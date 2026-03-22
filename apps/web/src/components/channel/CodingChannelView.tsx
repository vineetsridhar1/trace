import { useEffect, useCallback, useState } from "react";
import { Code } from "lucide-react";
import type { Session } from "@trace/gql";
import { useEntityStore, useEntityField } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { StartSessionDialog } from "./StartSessionDialog";
import { SessionsTable } from "./SessionsTable";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";
import { Skeleton } from "../ui/skeleton";

const SESSIONS_QUERY = gql`
  query Sessions($organizationId: ID!, $filters: SessionFilters) {
    sessions(organizationId: $organizationId, filters: $filters) {
      id
      name
      status
      tool
      model
      hosting
      prUrl
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
      parentSession {
        id
        name
      }
      childSessions {
        id
        name
      }
      createdAt
      updatedAt
    }
  }
`;

export function CodingChannelView({ channelId }: { channelId: string }) {
  const channelName = useEntityField("channels", channelId, "name");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const [loading, setLoading] = useState(true);
  const refreshTick = useUIStore((s) => s.refreshTick);

  const fetchSessions = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(SESSIONS_QUERY, {
        organizationId: activeOrgId,
        filters: { channelId },
      })
      .toPromise();

    if (result.data?.sessions) {
      const fetched = (result.data.sessions as Array<Session & { id: string }>).map((session) => ({
        ...session,
        _sortTimestamp: session.updatedAt,
      })) as Array<SessionEntity & { id: string }>;
      upsertMany("sessions", fetched);
    }
    setLoading(false);
  }, [activeOrgId, channelId, upsertMany]);

  useEffect(() => {
    setLoading(true);
    fetchSessions();
  }, [fetchSessions, refreshTick]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <Code size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {channelName ?? "Channel"}
        </h2>
        <ConnectionStatus />
        <StartSessionDialog channelId={channelId} />
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="px-4 pt-2 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 h-10 px-2">
                <Skeleton className="h-2 w-2 rounded-full shrink-0" />
                <Skeleton className="h-3.5 w-[40%]" />
                <Skeleton className="h-3.5 w-[15%]" />
                <Skeleton className="h-3.5 w-[10%] ml-auto" />
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
