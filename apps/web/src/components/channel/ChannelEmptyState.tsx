import { MessageSquarePlus } from "lucide-react";

export function ChannelEmptyState({ channelName }: { channelName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageSquarePlus size={40} strokeWidth={1.5} />
      <p className="text-sm">No messages in <span className="font-semibold">#{channelName}</span> yet.</p>
    </div>
  );
}
