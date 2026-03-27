import { useEntityStore } from "../../stores/entity";
import { MessageAvatar } from "./MessageAvatar";

export function StreamingMessage({
  agentId,
  text,
}: {
  agentId: string;
  text: string;
}) {
  const user = useEntityStore((s) => s.users[agentId]);
  const name = user?.name ?? "Agent";
  const avatarUrl = user?.avatarUrl as string | undefined;

  return (
    <div className="flex items-start gap-3 px-5 py-2">
      <MessageAvatar actorId={agentId} actorName={name} avatarUrl={avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <span className="text-xs font-medium text-muted-foreground">{name}</span>
        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words text-sm">
          {text}
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/70" />
        </div>
      </div>
    </div>
  );
}
