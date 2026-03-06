import { create } from 'zustand';

export interface PresenceUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

interface PresenceState {
  /** workspaceId → viewers (stable references when unchanged) */
  presenceByWorkspace: Map<string, PresenceUser[]>;
  setChannelPresence: (entries: { workspaceId: string; viewers: PresenceUser[] }[]) => void;
  clear: () => void;
}

function userListsEqual(a: PresenceUser[], b: PresenceUser[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].userId !== b[i].userId) return false;
  }
  return true;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  presenceByWorkspace: new Map(),

  setChannelPresence: (entries) =>
    set((state) => {
      const next = new Map<string, PresenceUser[]>();
      let changed = false;

      for (const entry of entries) {
        if (entry.viewers.length === 0) continue;
        const prev = state.presenceByWorkspace.get(entry.workspaceId);
        if (prev && userListsEqual(prev, entry.viewers)) {
          // Keep reference-stable array
          next.set(entry.workspaceId, prev);
        } else {
          next.set(entry.workspaceId, entry.viewers);
          changed = true;
        }
      }

      // Check if any old workspace was removed
      if (!changed) {
        for (const key of state.presenceByWorkspace.keys()) {
          if (!next.has(key)) {
            changed = true;
            break;
          }
        }
      }

      if (!changed && next.size === state.presenceByWorkspace.size) {
        return state;
      }

      return { presenceByWorkspace: next };
    }),

  clear: () => set({ presenceByWorkspace: new Map() }),
}));
