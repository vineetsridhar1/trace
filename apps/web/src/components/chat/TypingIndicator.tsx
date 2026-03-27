import { useEntityStore } from "../../stores/entity";
import { MessageAvatar } from "./MessageAvatar";

export function TypingIndicator({ agentId }: { agentId: string }) {
  const user = useEntityStore((s) => s.users[agentId]);
  const name = user?.name ?? "Agent";
  const avatarUrl = user?.avatarUrl as string | undefined;

  return (
    <div className="flex items-start gap-3 px-5 py-2">
      <MessageAvatar actorId={agentId} actorName={name} avatarUrl={avatarUrl} />
      <div className="flex flex-col gap-1 pt-1">
        <span className="text-xs font-medium text-muted-foreground">{name}</span>
        <div className="flex items-center gap-1">
          <span className="inline-flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
          </span>
          <span className="ml-1 text-xs text-muted-foreground">is thinking...</span>
        </div>
      </div>
    </div>
  );
}
