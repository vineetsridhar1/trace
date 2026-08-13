import { useEffect } from "react";
import { gql } from "@urql/core";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { Channel } from "@trace/gql";
import { client } from "../../lib/urql";
import { CodingChannelView } from "./CodingChannelView";
import { TextChannelView } from "./TextChannelView";

const SHARED_PROJECT_QUERY = gql`
  query SharedProject($id: ID!) {
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

export function ChannelView({ channelId }: { channelId: string }) {
  const channelType = useEntityField("channels", channelId, "type");
  const upsert = useEntityStore((state) => state.upsert);

  useEffect(() => {
    void client.query(SHARED_PROJECT_QUERY, { id: channelId }).toPromise().then((result) => {
      const channel = result.data?.channel as (Channel & { id: string }) | null | undefined;
      if (channel) upsert("channels", channel.id, channel);
    });
  }, [channelId, upsert]);

  if (channelType === "text") {
    return <TextChannelView channelId={channelId} />;
  }

  return <CodingChannelView channelId={channelId} />;
}
