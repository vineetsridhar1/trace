import { useCallback, useRef } from "react";
import {
  useAiConversationQuery,
} from "../hooks/useAiConversationQueries";
import { useConversationEventsSubscription } from "../hooks/useAiConversationSubscriptions";
import { useActiveBranchId } from "../hooks/useAiConversationSelectors";
import { BranchTimeline } from "./BranchTimeline";
import { BranchSwitcher } from "./BranchSwitcher";
import { TurnInput } from "./TurnInput";

interface ConversationViewProps {
  conversationId: string;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const { loading } = useAiConversationQuery(conversationId);
  const activeBranchId = useActiveBranchId(conversationId);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to conversation-level events
  useConversationEventsSubscription(conversationId);

  const focusInput = useCallback(() => {
    // Small delay to let the DOM update after branch switch
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  if (loading && !activeBranchId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!activeBranchId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No branch selected.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Branch switcher bar */}
      <BranchSwitcher conversationId={conversationId} />

      {/* Scrollable timeline */}
      <div className="flex-1 overflow-y-auto">
        <BranchTimeline
          branchId={activeBranchId}
          onFocusInput={focusInput}
        />
      </div>

      {/* Input */}
      <TurnInput
        branchId={activeBranchId}
        inputRef={inputRef}
      />
    </div>
  );
}
