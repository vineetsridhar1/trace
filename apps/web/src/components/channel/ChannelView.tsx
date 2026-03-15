import { useEffect, useCallback, useState } from "react";
import { Hash } from "lucide-react";
import type { Session } from "@trace/gql";
import { useEntityStore, useEntityField, useEntityIds } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { StartSessionDialog } from "./StartSessionDialog";
import { SessionRow } from "./SessionRow";
import { SessionDetailView } from "../session/SessionDetailView";

const SESSIONS_QUERY = gql`
  query Sessions($organizationId: ID!, $filters: SessionFilters) {
    sessions(organizationId: $organizationId, filters: $filters) {
      id
      name
      status
      tool
      model
      hosting
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

export function ChannelView({ channelId }: { channelId: string }) {
  const channelName = useEntityField("channels", channelId, "name");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const [loading, setLoading] = useState(true);
  const activeSessionId = useUIStore((s) => s.activeSessionId);

  const fetchSessions = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(SESSIONS_QUERY, {
        organizationId: activeOrgId,
        filters: { channelId },
      })
      .toPromise();

    if (result.data?.sessions) {
      const fetched = result.data.sessions as Array<Session & { id: string }>;
      upsertMany("sessions", fetched);
    }
    setLoading(false);
  }, [activeOrgId, channelId, upsertMany]);

  useEffect(() => {
    setLoading(true);
    fetchSessions();
  }, [fetchSessions]);

  const sessionIds = useEntityIds(
    "sessions",
    (s) => {
      const ch = (s as SessionEntity).channel as { id: string } | null | undefined;
      return ch?.id === channelId;
    },
  );

  if (activeSessionId) {
    return <SessionDetailView sessionId={activeSessionId} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Hash size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {channelName ?? "Channel"}
          </h2>
        </div>
        <StartSessionDialog channelId={channelId} />
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : sessionIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-muted-foreground">No sessions yet</p>
            <p className="text-xs text-muted-foreground">
              Click + to start an AI coding session
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessionIds.map((id) => (
              <SessionRow key={id} id={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
