import { useEffect } from "react";
import { useEntityField, useEntityStore } from "@trace/client-core";
import { fetchSharedChannel } from "../../lib/shared-channel";
import { CodingChannelView } from "./CodingChannelView";
import { TextChannelView } from "./TextChannelView";

export function ChannelView({ channelId }: { channelId: string }) {
  const channelType = useEntityField("channels", channelId, "type");
  const upsert = useEntityStore((state) => state.upsert);

  useEffect(() => {
    void fetchSharedChannel(channelId).then((channel) => {
      if (channel) upsert("channels", channel.id, channel);
    });
  }, [channelId, upsert]);

  if (channelType === "text") {
    return <TextChannelView channelId={channelId} />;
  }

  return <CodingChannelView channelId={channelId} />;
}
