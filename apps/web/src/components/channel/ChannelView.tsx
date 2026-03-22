import { useEntityField } from "../../stores/entity";
import { CodingChannelView } from "./CodingChannelView";
import { TextChannelView } from "./TextChannelView";

export function ChannelView({ channelId }: { channelId: string }) {
  const channelType = useEntityField("channels", channelId, "type");

  if (channelType === "text") {
    return <TextChannelView channelId={channelId} />;
  }

  return <CodingChannelView channelId={channelId} />;
}
