import { gql } from "@urql/core";
import type { Channel } from "@trace/gql";
import { client } from "./urql";

/**
 * Loads a single channel by id. Unlike the sidebar's member-only channel list,
 * this resolves any channel in the organization so a shared project link opens
 * for a viewer who hasn't joined it yet.
 */
const SHARED_CHANNEL_QUERY = gql`
  query SharedChannel($id: ID!) {
    channel(id: $id) {
      id
      name
      type
      visibility
      position
      groupId
      baseBranch
      setupScript
      runScripts
      viewerIsMember
      repo {
        id
        name
      }
    }
  }
`;

export async function fetchSharedChannel(
  channelId: string,
): Promise<(Channel & { id: string }) | null> {
  const result = await client.query(SHARED_CHANNEL_QUERY, { id: channelId }).toPromise();
  return (result.data?.channel as (Channel & { id: string }) | null | undefined) ?? null;
}
