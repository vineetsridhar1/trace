import { MessageSquareDashed } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
      <MessageSquareDashed size={36} strokeWidth={1.5} />
      <p className="text-sm">No messages yet. Say hello!</p>
    </div>
  );
}
