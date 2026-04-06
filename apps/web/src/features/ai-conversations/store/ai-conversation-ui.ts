import { create } from "zustand";

interface AiConversationUIState {
  /** Active branch ID per conversation */
  activeBranchByConversation: Record<string, string>;
  /** Pending scroll target turn ID */
  scrollTargetTurnId: string | null;
  /** Branch switcher open/closed state */
  branchSwitcherOpen: boolean;

  setActiveBranch: (conversationId: string, branchId: string) => void;
  getActiveBranch: (conversationId: string) => string | undefined;
  setScrollTargetTurnId: (turnId: string | null) => void;
  setBranchSwitcherOpen: (open: boolean) => void;
}

export const useAiConversationUIStore = create<AiConversationUIState>((set, get) => ({
  activeBranchByConversation: {},
  scrollTargetTurnId: null,
  branchSwitcherOpen: false,

  setActiveBranch: (conversationId, branchId) =>
    set((state) => ({
      activeBranchByConversation: {
        ...state.activeBranchByConversation,
        [conversationId]: branchId,
      },
    })),

  getActiveBranch: (conversationId) =>
    get().activeBranchByConversation[conversationId],

  setScrollTargetTurnId: (turnId) => set({ scrollTargetTurnId: turnId }),

  setBranchSwitcherOpen: (open) => set({ branchSwitcherOpen: open }),
}));
