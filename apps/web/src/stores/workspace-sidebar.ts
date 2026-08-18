import { create } from "zustand";

export type WorkspaceSidebarView = "files" | "changes";

interface SidebarFileOpenRequest {
  id: string;
  sessionGroupId: string;
  filePath: string;
  kind: "file" | "diff";
  status?: string;
}

interface WorkspaceSidebarState {
  filesSessionGroupId: string | null;
  view: WorkspaceSidebarView;
  fileOpenRequest: SidebarFileOpenRequest | null;
  openFiles: (sessionGroupId: string, view?: WorkspaceSidebarView) => void;
  toggleFiles: (sessionGroupId: string) => void;
  closeFiles: () => void;
  setView: (view: WorkspaceSidebarView) => void;
  requestFileOpen: (sessionGroupId: string, filePath: string) => void;
  requestDiffOpen: (sessionGroupId: string, filePath: string, status: string) => void;
  consumeFileOpenRequest: (id: string) => void;
}

export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>((set) => ({
  filesSessionGroupId: null,
  view: "files",
  fileOpenRequest: null,
  openFiles: (sessionGroupId, view = "files") => set({ filesSessionGroupId: sessionGroupId, view }),
  toggleFiles: (sessionGroupId) =>
    set((state) => ({
      filesSessionGroupId: state.filesSessionGroupId === sessionGroupId ? null : sessionGroupId,
    })),
  closeFiles: () => set({ filesSessionGroupId: null }),
  setView: (view) => set({ view }),
  requestFileOpen: (sessionGroupId, filePath) =>
    set({
      fileOpenRequest: {
        id: crypto.randomUUID(),
        sessionGroupId,
        filePath,
        kind: "file",
      },
    }),
  requestDiffOpen: (sessionGroupId, filePath, status) =>
    set({
      fileOpenRequest: {
        id: crypto.randomUUID(),
        sessionGroupId,
        filePath,
        kind: "diff",
        status,
      },
    }),
  consumeFileOpenRequest: (id) =>
    set((state) => (state.fileOpenRequest?.id === id ? { fileOpenRequest: null } : state)),
}));
