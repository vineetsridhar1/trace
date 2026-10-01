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
  changesReviewId: string | null;
  fileOpenRequest: SidebarFileOpenRequest | null;
  openFiles: (
    sessionGroupId: string,
    view?: WorkspaceSidebarView,
    reviewId?: string | null,
  ) => void;
  toggleFiles: (sessionGroupId: string) => void;
  closeFiles: () => void;
  setView: (view: WorkspaceSidebarView) => void;
  clearChangesReview: () => void;
  requestFileOpen: (sessionGroupId: string, filePath: string) => void;
  requestDiffOpen: (sessionGroupId: string, filePath: string, status: string) => void;
  consumeFileOpenRequest: (id: string) => void;
}

export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>((set) => ({
  filesSessionGroupId: null,
  view: "files",
  changesReviewId: null,
  fileOpenRequest: null,
  openFiles: (sessionGroupId, view = "files", reviewId = null) =>
    set({ filesSessionGroupId: sessionGroupId, view, changesReviewId: reviewId }),
  toggleFiles: (sessionGroupId) =>
    set((state) => ({
      filesSessionGroupId: state.filesSessionGroupId === sessionGroupId ? null : sessionGroupId,
      changesReviewId: null,
    })),
  closeFiles: () => set({ filesSessionGroupId: null, changesReviewId: null }),
  setView: (view) => set({ view }),
  clearChangesReview: () => set({ changesReviewId: null }),
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
