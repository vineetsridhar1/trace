import { create } from "zustand";

interface AiConversationUIState {
  /** Active branch ID per conversation */
  activeBranchByConversation: Record<string, string>;
  /** Pending scroll target turn ID */
  scrollTargetTurnId: string | null;
  /** Turn ID currently highlighted after scroll (cleared after animation) */
  highlightTurnId: string | null;
  /** Branch switcher open/closed state */
  branchSwitcherOpen: boolean;
  /** Branch tree panel open/closed state */
  branchTreePanelOpen: boolean;
  /** Collapsed node IDs in the branch tree panel */
  collapsedTreeNodes: Record<string, boolean>;

  setActiveBranch: (conversationId: string, branchId: string) => void;
  getActiveBranch: (conversationId: string) => string | undefined;
  setScrollTargetTurnId: (turnId: string | null) => void;
  setHighlightTurnId: (turnId: string | null) => void;
  setBranchSwitcherOpen: (open: boolean) => void;
  setBranchTreePanelOpen: (open: boolean) => void;
  toggleBranchTreePanel: () => void;
  toggleTreeNodeCollapsed: (branchId: string) => void;
}

export const useAiConversationUIStore = create<AiConversationUIState>((set, get) => ({
  activeBranchByConversation: {},
  scrollTargetTurnId: null,
  highlightTurnId: null,
  branchSwitcherOpen: false,
  branchTreePanelOpen: true,
  collapsedTreeNodes: {},

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

  setHighlightTurnId: (turnId) => set({ highlightTurnId: turnId }),

  setBranchSwitcherOpen: (open) => set({ branchSwitcherOpen: open }),

  setBranchTreePanelOpen: (open) => set({ branchTreePanelOpen: open }),

  toggleBranchTreePanel: () =>
    set((state) => ({ branchTreePanelOpen: !state.branchTreePanelOpen })),

  toggleTreeNodeCollapsed: (branchId) =>
    set((state) => ({
      collapsedTreeNodes: {
        ...state.collapsedTreeNodes,
        [branchId]: !state.collapsedTreeNodes[branchId],
      },
    })),
}));
