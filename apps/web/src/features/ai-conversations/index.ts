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
  useTurn,
  useTurnField,
  useActiveBranchId,
  useScrollTargetTurnId,
  useHighlightTurnId,
  useBranchSwitcherOpen,
  type TimelineEntry,
} from "./hooks/useAiConversationSelectors";

// Query hooks
export {
  useAiConversationsQuery,
  useAiConversationQuery,
  useBranchTimelineQuery,
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
} from "./hooks/useAiConversationMutations";

// Hooks
export { useScrollToTurn } from "./hooks/useScrollToTurn";
export { useReturnToForkShortcut } from "./hooks/useReturnToForkShortcut";

// Components
export { ReturnToForkPoint } from "./components/ReturnToForkPoint";
export { TurnHighlight } from "./components/TurnHighlight";

// Utils
export { processAiConversationEvent } from "./utils/processAiConversationEvent";
