import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { ORG_MEMBERS_QUERY, useAuthStore } from "@trace/client-core";
import { TRACE_AI_USER_ID } from "@trace/shared";
import { client } from "../../lib/urql";

const CHANNEL_MEMBERS_QUERY = gql`
  query ChannelMembers($id: ID!) {
    channel(id: $id) {
      id
      members {
        user {
          id
          name
          email
          avatarUrl
        }
      }
    }
  }
`;

export interface ChannelPerson {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

function isHuman(person: ChannelPerson): boolean {
  return person.id !== TRACE_AI_USER_ID;
}

/** Workspace roster and current project members, refetched whenever `enabled` turns on. */
export function useChannelPeople(channelId: string, enabled: boolean) {
  const [orgMembers, setOrgMembers] = useState<ChannelPerson[]>([]);
  const [channelMembers, setChannelMembers] = useState<ChannelPerson[]>([]);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    const [orgResult, channelResult] = await Promise.all([
      client.query(ORG_MEMBERS_QUERY, { id: activeOrgId }).toPromise(),
      client.query(CHANNEL_MEMBERS_QUERY, { id: channelId }).toPromise(),
    ]);

    // The Trace AI agent is an OrgMember of every organization; project access
    // is about human access only, so it never appears in these lists.
    const rawOrgMembers = orgResult.data?.organization?.members as
      | Array<{ user: ChannelPerson }>
      | undefined;
    if (rawOrgMembers) setOrgMembers(rawOrgMembers.map((member) => member.user).filter(isHuman));

    const rawChannelMembers = channelResult.data?.channel?.members as
      | Array<{ user: ChannelPerson }>
      | undefined;
    setChannelMembers(rawChannelMembers?.map((member) => member.user).filter(isHuman) ?? []);
  }, [activeOrgId, channelId]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { orgMembers, channelMembers, refresh };
}
