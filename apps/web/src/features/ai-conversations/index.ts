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
  useUpdateAiConversation,
} from "./hooks/useAiConversationMutations";

// Shortcut hooks
export { useNewConversationShortcut } from "./hooks/useNewConversationShortcut";

// Components
export { AiConversationView } from "./components/AiConversationView";
export { ModelPicker } from "./components/ModelPicker";
export { ConversationSettings } from "./components/ConversationSettings";
export { NewConversationButton } from "./components/NewConversationButton";

// Constants
export {
  AVAILABLE_MODELS,
  DEFAULT_MODEL_ID,
  getModelLabel,
} from "./constants";

// Utils
export { processAiConversationEvent } from "./utils/processAiConversationEvent";
