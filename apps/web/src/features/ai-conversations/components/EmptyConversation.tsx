import { MessageSquare } from "lucide-react";

export function EmptyConversation() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <MessageSquare size={24} className="text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        Start a conversation by sending a message below.
      </p>
    </div>
  );
}
