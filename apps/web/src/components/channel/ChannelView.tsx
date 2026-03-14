import { useEffect, useState, useCallback } from "react";
import { Hash, Circle } from "lucide-react";
import { useEntityStore, useEntityField } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { StartSessionDialog } from "./StartSessionDialog";

const SESSIONS_QUERY = gql`
  query Sessions($organizationId: ID!, $filters: SessionFilters) {
    sessions(organizationId: $organizationId, filters: $filters) {
      id
      name
      status
      tool
      hosting
      createdBy {
        id
        name
        avatarUrl
      }
      channel {
        id
      }
      createdAt
    }
  }
`;

const statusColor: Record<string, string> = {
  active: "text-green-400",
  paused: "text-yellow-400",
  completed: "text-muted-foreground",
  failed: "text-destructive",
  unreachable: "text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  unreachable: "Unreachable",
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SessionRow({ id }: { id: string }) {
  const name = useEntityField("sessions", id, "name");
  const status = useEntityField("sessions", id, "status") as string | undefined;
  const createdAt = useEntityField("sessions", id, "createdAt") as string | undefined;
  const createdBy = useEntityField("sessions", id, "createdBy") as
    | { name?: string; avatarUrl?: string }
    | undefined;

  return (
    <tr className="group border-b border-border last:border-b-0 transition-colors hover:bg-surface-elevated/50">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <Circle size={8} className={`shrink-0 fill-current ${statusColor[status ?? "active"]}`} />
          <span className="text-sm text-foreground truncate">{name}</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-xs ${statusColor[status ?? "active"]}`}>
          {statusLabel[status ?? "active"]}
        </span>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1.5">
          {createdBy?.avatarUrl ? (
            <img
              src={createdBy.avatarUrl}
              alt={createdBy.name}
              className="h-4 w-4 rounded-full"
            />
          ) : null}
          <span className="text-xs text-muted-foreground">{createdBy?.name}</span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-xs text-muted-foreground">
          {createdAt ? timeAgo(createdAt) : ""}
        </span>
      </td>
    </tr>
  );
}

export function ChannelView({ channelId }: { channelId: string }) {
  const channelName = useEntityField("channels", channelId, "name");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(SESSIONS_QUERY, { organizationId: activeOrgId })
      .toPromise();

    if (result.data?.sessions) {
      const sessions = result.data.sessions as Array<{ id: string }>;
      upsertMany("sessions", sessions as Array<{ id: string } & any>);
      // Filter sessions belonging to this channel
      const channelSessions = (result.data.sessions as Array<{ id: string; channel?: { id: string } }>)
        .filter((s: any) => s.channel?.id === channelId || s.channelId === channelId);
      setSessionIds(channelSessions.map((s) => s.id));
    }
    setLoading(false);
  }, [activeOrgId, channelId, upsertMany]);

  useEffect(() => {
    setLoading(true);
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Hash size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {channelName ?? "Channel"}
          </h2>
        </div>
        <StartSessionDialog channelId={channelId} onCreated={fetchSessions} />
      </div>

      {/* Sessions table */}
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Session</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Created by</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {sessionIds.map((id) => (
                <SessionRow key={id} id={id} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
