import { gql } from "@urql/core";
import {
  useEntityStore,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import type { Session, SessionGroup } from "@trace/gql";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";

const SESSION_GROUPS_QUERY = gql`
  query MobileChannelSessionGroups(
    $channelId: ID!
    $archived: Boolean
    $status: SessionGroupStatus
  ) {
    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {
      id
      name
      slug
      status
      branch
      prUrl
      worktreeDeleted
      archivedAt
      createdAt
      updatedAt
      channel { id }
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
        lastMessageAt
        lastUserMessageAt
        createdBy { id name avatarUrl }
        repo { id name }
        channel { id }
        createdAt
        updatedAt
      }
    }
  }
`;

export type SessionGroupsView = "active" | "merged" | "archived";

function variablesForView(
  channelId: string,
  view: SessionGroupsView,
): Record<string, unknown> {
  if (view === "archived") return { channelId, archived: true };
  if (view === "merged") return { channelId, archived: false, status: "merged" };
  return { channelId, archived: false };
}

/**
 * Fetch session groups + their sessions for a channel and upsert them into
 * the entity store. Used by the active landing screen and the merged-archived
 * sub-screen — both render from the store so they react to ambient events
 * after the initial fetch.
 */
export async function fetchChannelSessionGroups(
  channelId: string,
  view: SessionGroupsView,
): Promise<string | null> {
  const client = getClient();
  const result = await client
    .query(SESSION_GROUPS_QUERY, variablesForView(channelId, view))
    .toPromise();
  if (result.error) {
    return userFacingError(result.error, "Couldn't load sessions for this channel.");
  }
  if (!result.data?.sessionGroups) {
    return "Couldn't load sessions for this channel.";
  }
  const groups = result.data.sessionGroups as Array<SessionGroup & { id: string }>;
  const upsertMany = useEntityStore.getState().upsertMany;
  const sessions = groups.flatMap((g) => g.sessions ?? []) as Array<Session & { id: string }>;
  upsertMany(
    "sessionGroups",
    groups.map((g) => ({
      ...g,
      _sortTimestamp:
        g.sessions?.[0]?.lastMessageAt
        ?? g.sessions?.[0]?.updatedAt
        ?? g.updatedAt,
    })) as Array<SessionGroupEntity & { id: string }>,
  );
  if (sessions.length > 0) {
    upsertMany("sessions", sessions as Array<SessionEntity & { id: string }>);
  }
  return null;
}
