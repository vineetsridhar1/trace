import { useState, useCallback } from 'react';

export type SidebarSectionId = 'channels' | 'teams' | 'projects' | 'my-workspaces' | 'ai-chats';

const DEFAULT_ORDER: SidebarSectionId[] = ['channels', 'teams', 'projects', 'my-workspaces', 'ai-chats'];
const ALL_SECTIONS = new Set<SidebarSectionId>(DEFAULT_ORDER);

const ORDER_KEY = 'sidebar-section-order';
const COLLAPSED_KEY = 'sidebar-collapsed-sections';

function loadOrder(): SidebarSectionId[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    const valid = parsed.filter((id): id is SidebarSectionId => ALL_SECTIONS.has(id as SidebarSectionId));
    // Merge: keep stored order for known sections, append any new sections not in stored data
    const seen = new Set(valid);
    for (const id of DEFAULT_ORDER) {
      if (!seen.has(id)) valid.push(id);
    }
    return valid;
  } catch {
    return DEFAULT_ORDER;
  }
}

function loadCollapsed(): Set<SidebarSectionId> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is SidebarSectionId => ALL_SECTIONS.has(id as SidebarSectionId)));
  } catch {
    return new Set();
  }
}

export function useSidebarPrefs() {
  const [sectionOrder, setSectionOrder] = useState<SidebarSectionId[]>(loadOrder);
  const [collapsedSections, setCollapsedSections] = useState<Set<SidebarSectionId>>(loadCollapsed);

  const reorder = useCallback((newOrder: SidebarSectionId[]) => {
    setSectionOrder(newOrder);
    localStorage.setItem(ORDER_KEY, JSON.stringify(newOrder));
  }, []);

  const toggleCollapsed = useCallback((id: SidebarSectionId) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { sectionOrder, collapsedSections, reorder, toggleCollapsed };
}
