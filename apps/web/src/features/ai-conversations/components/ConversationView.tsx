import { SidebarTrigger } from "../../../components/ui/sidebar";
import {
  useAiConversationQuery,
  useBranchTimelineQuery,
} from "../hooks/useAiConversationQueries";
import {
  useConversationEventsSubscription,
  useBranchTurnsSubscription,
} from "../hooks/useAiConversationSubscriptions";
import { useActiveBranchId, useAiConversationField } from "../hooks/useAiConversationSelectors";
import { useEntityStore } from "../../../stores/entity";
import { TurnList } from "./TurnList";
import { TurnInput } from "./TurnInput";
import { Skeleton } from "../../../components/ui/skeleton";

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { loading: convLoading } = useAiConversationQuery(conversationId);
  const activeBranchId = useActiveBranchId(conversationId);
  const title = useAiConversationField(conversationId, "title");
  const rootBranchId = useAiConversationField(conversationId, "rootBranchId");

  const branchId = activeBranchId ?? rootBranchId ?? "";
  const { loading: branchLoading } = useBranchTimelineQuery(branchId);

  // Real-time subscriptions
  useConversationEventsSubscription(conversationId);
  useBranchTurnsSubscription(branchId || null);

  // Check if AI is generating (last turn is USER with no ASSISTANT following)
  const isAiGenerating = useIsAiGenerating(branchId);

  const loading = convLoading || branchLoading;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <h2 className="truncate text-sm font-medium text-foreground">
          {title ?? "New Conversation"}
        </h2>
      </header>

      {loading ? (
        <ConversationSkeleton />
      ) : (
        <>
          <TurnList branchId={branchId} />
          <TurnInput branchId={branchId} disabled={isAiGenerating} />
        </>
      )}
    </div>
  );
}

function useIsAiGenerating(branchId: string): boolean {
  return useEntityStore((state) => {
    const branch = state.aiBranches[branchId];
    if (!branch || branch.turnIds.length === 0) return false;
    const lastTurnId = branch.turnIds[branch.turnIds.length - 1];
    const lastTurn = state.aiTurns[lastTurnId];
    return lastTurn?.role === "USER" && !lastTurn._optimistic;
  });
}

function ConversationSkeleton() {
  return (
    <div className="flex-1 overflow-hidden px-4 py-6 space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={i % 2 === 0 ? "flex justify-end" : ""}>
          <div className="max-w-[80%] space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}
