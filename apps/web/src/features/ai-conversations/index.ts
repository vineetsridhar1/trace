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

// Components
export { BranchSwitcher } from "./components/BranchSwitcher";
export { BranchSwitcherItem } from "./components/BranchSwitcherItem";

// Hooks (keyboard shortcut)
export { useBranchSwitcherShortcut } from "./hooks/useBranchSwitcherShortcut";

// Utils
export { processAiConversationEvent } from "./utils/processAiConversationEvent";
