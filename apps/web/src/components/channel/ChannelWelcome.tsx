import { Hash } from "lucide-react";
import { useEntityField } from "../../stores/entity";

export function ChannelWelcome({ channelId }: { channelId: string }) {
  const name = useEntityField("channels", channelId, "name");

  return (
    <div className="px-4 pb-6 pt-8">
      <div className="mb-2 flex items-center gap-2">
        <Hash size={28} strokeWidth={2.5} className="text-foreground" />
        <h1 className="text-2xl font-bold text-foreground">{name}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        This is the very beginning of the{" "}
        <span className="font-semibold text-foreground">#{name}</span> channel.
      </p>
    </div>
  );
}
