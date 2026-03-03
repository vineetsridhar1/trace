import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────
export type ViewMode = 'agent' | 'ticket' | 'files' | 'terminal' | 'browser';

export interface PaneGroup {
  type: 'pane';
  id: string;
  tabs: ViewMode[];
  activeTab: ViewMode;
}

export interface SplitNode {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = PaneGroup | SplitNode;

type SingletonKey = 'terminal' | 'browser';

// ─── Tree helpers (pure functions) ────────────────────────────────

let nextId = 1;
function genId(): string {
  return `pane-${nextId++}`;
}

function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.type === 'split') {
    return findNode(root.first, id) ?? findNode(root.second, id);
  }
  return null;
}

function replaceNode(root: LayoutNode, id: string, newNode: LayoutNode): LayoutNode {
  if (root.id === id) return newNode;
  if (root.type === 'split') {
    return {
      ...root,
      first: replaceNode(root.first, id, newNode),
      second: replaceNode(root.second, id, newNode),
    };
  }
  return root;
}

/** Remove a pane, collapsing its parent split into the remaining sibling. */
function removePane(root: LayoutNode, paneId: string): LayoutNode | null {
  if (root.type === 'pane') {
    return root.id === paneId ? null : root;
  }
  // Split node — check if either child is the target
  if (root.first.type === 'pane' && root.first.id === paneId) return root.second;
  if (root.second.type === 'pane' && root.second.id === paneId) return root.first;

  // Recurse into children
  const newFirst = removePane(root.first, paneId);
  if (newFirst !== root.first) {
    return newFirst === null ? root.second : { ...root, first: newFirst };
  }
  const newSecond = removePane(root.second, paneId);
  if (newSecond !== root.second) {
    return newSecond === null ? root.first : { ...root, second: newSecond };
  }
  return root;
}

/** Check if any pane in the tree has a given view as activeTab. */
export function hasViewInTree(root: LayoutNode, view: ViewMode): boolean {
  if (root.type === 'pane') return root.activeTab === view;
  return hasViewInTree(root.first, view) || hasViewInTree(root.second, view);
}

/** Check if any pane in the tree contains a given view in its tabs. */
export function hasTabInTree(root: LayoutNode, view: ViewMode): boolean {
  if (root.type === 'pane') return root.tabs.includes(view);
  return hasTabInTree(root.first, view) || hasTabInTree(root.second, view);
}

/** Find the pane group that contains a given tab. */
function findPaneWithTab(root: LayoutNode, tab: ViewMode): PaneGroup | null {
  if (root.type === 'pane') return root.tabs.includes(tab) ? root : null;
  return findPaneWithTab(root.first, tab) ?? findPaneWithTab(root.second, tab);
}

/** Collect all pane group IDs from the tree. */
export function collectPaneIds(root: LayoutNode): string[] {
  if (root.type === 'pane') return [root.id];
  return [...collectPaneIds(root.first), ...collectPaneIds(root.second)];
}

/** Replace all panes that have a given activeTab with a different activeTab. */
function switchActiveTabs(root: LayoutNode, from: ViewMode, to: ViewMode): LayoutNode {
  if (root.type === 'pane') {
    if (root.activeTab === from) {
      const newTabs = root.tabs.filter((t) => t !== from);
      if (!newTabs.includes(to)) newTabs.push(to);
      return { ...root, tabs: newTabs, activeTab: to };
    }
    return root;
  }
  return {
    ...root,
    first: switchActiveTabs(root.first, from, to),
    second: switchActiveTabs(root.second, from, to),
  };
}

// ─── Store ────────────────────────────────────────────────────────

interface PanelLayoutState {
  root: LayoutNode;
  singletonOwners: Record<SingletonKey, string | null>;

  // Drag state — tracks whether a tab is being dragged (for showing drop zones)
  draggedTab: ViewMode | null;
  dragSourcePaneId: string | null;

  // Actions
  setActiveTab: (paneId: string, tab: ViewMode) => void;
  /** Activate a tab by ViewMode — finds the pane that contains it and switches. */
  activateTab: (tab: ViewMode) => void;
  reorderTabs: (paneId: string, tabs: ViewMode[]) => void;
  moveTab: (fromPaneId: string, tab: ViewMode, toPaneId: string) => void;
  splitPane: (paneId: string, direction: 'horizontal' | 'vertical', side: 'first' | 'second', tab: ViewMode) => void;
  closeTab: (paneId: string, tab: ViewMode) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
  resetForWorkspace: (isMerged: boolean, hasTicket: boolean) => void;
  switchSingletonPanes: (from: ViewMode, to: ViewMode) => void;
  startDrag: (tab: ViewMode, paneId: string) => void;
  endDrag: () => void;
}

function isSingleton(tab: ViewMode): tab is SingletonKey {
  return tab === 'terminal' || tab === 'browser';
}

function updateSingletonOwners(root: LayoutNode): Record<SingletonKey, string | null> {
  const termPane = findPaneWithTab(root, 'terminal');
  const browserPane = findPaneWithTab(root, 'browser');
  return {
    terminal: termPane && termPane.activeTab === 'terminal' ? termPane.id : null,
    browser: browserPane && browserPane.activeTab === 'browser' ? browserPane.id : null,
  };
}

const ALL_TABS: ViewMode[] = ['agent', 'ticket', 'files', 'terminal', 'browser'];

const defaultRoot: PaneGroup = {
  type: 'pane',
  id: 'root',
  tabs: [...ALL_TABS],
  activeTab: 'agent',
};

export const usePanelLayoutStore = create<PanelLayoutState>((set) => ({
  root: defaultRoot,
  singletonOwners: { terminal: null, browser: null },
  draggedTab: null,
  dragSourcePaneId: null,

  setActiveTab: (paneId, tab) =>
    set((state) => {
      const node = findNode(state.root, paneId);
      if (!node || node.type !== 'pane') return state;
      const updated: PaneGroup = { ...node, activeTab: tab };
      const newRoot = replaceNode(state.root, paneId, updated);
      return { root: newRoot, singletonOwners: updateSingletonOwners(newRoot) };
    }),

  activateTab: (tab) =>
    set((state) => {
      const pane = findPaneWithTab(state.root, tab);
      if (!pane) return state;
      if (pane.activeTab === tab) return state;
      const updated: PaneGroup = { ...pane, activeTab: tab };
      const newRoot = replaceNode(state.root, pane.id, updated);
      return { root: newRoot, singletonOwners: updateSingletonOwners(newRoot) };
    }),

  reorderTabs: (paneId, tabs) =>
    set((state) => {
      const node = findNode(state.root, paneId);
      if (!node || node.type !== 'pane') return state;
      const updated: PaneGroup = { ...node, tabs };
      const newRoot = replaceNode(state.root, paneId, updated);
      return { root: newRoot };
    }),

  moveTab: (fromPaneId, tab, toPaneId) =>
    set((state) => {
      if (fromPaneId === toPaneId) return state;
      const source = findNode(state.root, fromPaneId);
      const target = findNode(state.root, toPaneId);
      if (!source || source.type !== 'pane' || !target || target.type !== 'pane') return state;
      if (!source.tabs.includes(tab)) return state;
      if (target.tabs.includes(tab)) return state;

      // Remove tab from source
      const newSourceTabs = source.tabs.filter((t) => t !== tab);
      let newRoot: LayoutNode;

      if (newSourceTabs.length === 0) {
        // Source pane is empty — remove it
        const collapsed = removePane(state.root, fromPaneId);
        if (!collapsed) return state;
        newRoot = collapsed;
      } else {
        const newActiveTab = source.activeTab === tab ? newSourceTabs[0] : source.activeTab;
        newRoot = replaceNode(state.root, fromPaneId, {
          ...source,
          tabs: newSourceTabs,
          activeTab: newActiveTab,
        });
      }

      // Add tab to target
      const updatedTarget = findNode(newRoot, toPaneId);
      if (!updatedTarget || updatedTarget.type !== 'pane') return state;
      newRoot = replaceNode(newRoot, toPaneId, {
        ...updatedTarget,
        tabs: [...updatedTarget.tabs, tab],
        activeTab: tab,
      });

      return { root: newRoot, singletonOwners: updateSingletonOwners(newRoot) };
    }),

  splitPane: (paneId, direction, side, tab) =>
    set((state) => {
      const existing = findNode(state.root, paneId);
      if (!existing || existing.type !== 'pane') return state;

      // If the tab already exists somewhere, remove it from its current location
      let workingRoot = state.root;
      const currentOwner = findPaneWithTab(workingRoot, tab);
      if (currentOwner) {
        const newTabs = currentOwner.tabs.filter((t) => t !== tab);
        if (newTabs.length === 0) {
          const collapsed = removePane(workingRoot, currentOwner.id);
          if (!collapsed) return state;
          workingRoot = collapsed;
          // Re-find the target pane after tree modification
          const refound = findNode(workingRoot, paneId);
          if (!refound || refound.type !== 'pane') return state;
        } else {
          const newActive = currentOwner.activeTab === tab ? newTabs[0] : currentOwner.activeTab;
          workingRoot = replaceNode(workingRoot, currentOwner.id, {
            ...currentOwner,
            tabs: newTabs,
            activeTab: newActive,
          });
        }
      }

      const targetPane = findNode(workingRoot, paneId);
      if (!targetPane) return state;

      const newPane: PaneGroup = {
        type: 'pane',
        id: genId(),
        tabs: [tab],
        activeTab: tab,
      };

      const splitNode: SplitNode = {
        type: 'split',
        id: genId(),
        direction,
        ratio: 0.5,
        first: side === 'first' ? newPane : targetPane,
        second: side === 'second' ? newPane : targetPane,
      };

      const newRoot = replaceNode(workingRoot, paneId, splitNode);
      return { root: newRoot, singletonOwners: updateSingletonOwners(newRoot) };
    }),

  closeTab: (paneId, tab) =>
    set((state) => {
      const node = findNode(state.root, paneId);
      if (!node || node.type !== 'pane') return state;

      const newTabs = node.tabs.filter((t) => t !== tab);
      if (newTabs.length === 0) {
        // Remove the pane entirely
        const collapsed = removePane(state.root, paneId);
        if (!collapsed) {
          // Last pane — reset to all tabs with agent active
          const newRoot: PaneGroup = { type: 'pane', id: 'root', tabs: [...ALL_TABS], activeTab: 'agent' };
          return { root: newRoot, singletonOwners: updateSingletonOwners(newRoot) };
        }
        return { root: collapsed, singletonOwners: updateSingletonOwners(collapsed) };
      }

      const newActive = node.activeTab === tab ? newTabs[0] : node.activeTab;
      const newRoot = replaceNode(state.root, paneId, { ...node, tabs: newTabs, activeTab: newActive });
      return { root: newRoot, singletonOwners: updateSingletonOwners(newRoot) };
    }),

  setSplitRatio: (splitId, ratio) =>
    set((state) => {
      const clamped = Math.max(0.15, Math.min(0.85, ratio));
      const node = findNode(state.root, splitId);
      if (!node || node.type !== 'split') return state;
      return { root: replaceNode(state.root, splitId, { ...node, ratio: clamped }) };
    }),

  resetForWorkspace: (isMerged, hasTicket) =>
    set(() => {
      const activeTab: ViewMode = isMerged && hasTicket ? 'ticket' : 'agent';
      const newRoot: PaneGroup = { type: 'pane', id: 'root', tabs: [...ALL_TABS], activeTab };
      return { root: newRoot, singletonOwners: { terminal: null, browser: null } };
    }),

  switchSingletonPanes: (from, to) =>
    set((state) => {
      const newRoot = switchActiveTabs(state.root, from, to);
      return { root: newRoot, singletonOwners: updateSingletonOwners(newRoot) };
    }),

  startDrag: (tab, paneId) => set({ draggedTab: tab, dragSourcePaneId: paneId }),
  endDrag: () => set({ draggedTab: null, dragSourcePaneId: null }),
}));
