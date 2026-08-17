import { create } from "zustand";

interface SidebarFileOpenRequest {
  id: string;
  sessionGroupId: string;
  filePath: string;
}

interface WorkspaceSidebarState {
  filesSessionGroupId: string | null;
  fileOpenRequest: SidebarFileOpenRequest | null;
  openFiles: (sessionGroupId: string) => void;
  closeFiles: () => void;
  requestFileOpen: (sessionGroupId: string, filePath: string) => void;
  consumeFileOpenRequest: (id: string) => void;
}

export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>((set) => ({
  filesSessionGroupId: null,
  fileOpenRequest: null,
  openFiles: (sessionGroupId) => set({ filesSessionGroupId: sessionGroupId }),
  closeFiles: () => set({ filesSessionGroupId: null }),
  requestFileOpen: (sessionGroupId, filePath) =>
    set({
      fileOpenRequest: {
        id: crypto.randomUUID(),
        sessionGroupId,
        filePath,
      },
    }),
  consumeFileOpenRequest: (id) =>
    set((state) => (state.fileOpenRequest?.id === id ? { fileOpenRequest: null } : state)),
}));
