// Store
export { useAiConversationUIStore } from "./store/ai-conversation-ui";

// Selectors
export {
  useAiConversation,
  useAiConversationField,
  useAiConversations,
  useBranch,
  useBranchField,
  useBranchTurns,
  useBranchTimeline,
  useBranchSummary,
  useTurn,
  useTurnField,
  useActiveBranchId,
  useScrollTargetTurnId,
  useBranchSwitcherOpen,
  type TimelineEntry,
} from "./hooks/useAiConversationSelectors";

// Query hooks
export {
  useAiConversationsQuery,
  useAiConversationQuery,
  useBranchTimelineQuery,
  useContextHealthQuery,
  type ContextHealthData,
} from "./hooks/useAiConversationQueries";

// Subscription hooks
export {
  useConversationEventsSubscription,
  useBranchTurnsSubscription,
} from "./hooks/useAiConversationSubscriptions";

// Mutation hooks
export {
  useCreateAiConversation,
  useSendTurn,
  useUpdateAiConversationTitle,
  useSummarizeBranch,
} from "./hooks/useAiConversationMutations";

// Utils
export { processAiConversationEvent } from "./utils/processAiConversationEvent";
