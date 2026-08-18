import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { useAuthStore } from "@trace/client-core";
import { create } from "zustand";

export type WorkspaceBrowserRequest = {
  id: string;
  sessionGroupId: string;
  url: string;
};

type WorkspaceRequestState = {
  browserRequestsByGroup: Record<string, WorkspaceBrowserRequest[]>;
  enqueueBrowserRequest: (request: WorkspaceBrowserRequest) => void;
  consumeBrowserRequests: (sessionGroupId: string) => void;
};

export const useWorkspaceRequestStore = create<WorkspaceRequestState>((set) => ({
  browserRequestsByGroup: {},
  enqueueBrowserRequest: (request) =>
    set((state) => {
      const existing = state.browserRequestsByGroup[request.sessionGroupId] ?? [];
      if (existing.some((candidate) => candidate.id === request.id)) return state;
      return {
        browserRequestsByGroup: {
          ...state.browserRequestsByGroup,
          [request.sessionGroupId]: [...existing, request],
        },
      };
    }),
  consumeBrowserRequests: (sessionGroupId) =>
    set((state) => {
      if (!state.browserRequestsByGroup[sessionGroupId]?.length) return state;
      const next = { ...state.browserRequestsByGroup };
      delete next[sessionGroupId];
      return { browserRequestsByGroup: next };
    }),
}));

export function reconcileWorkspaceRequestEvent(event: Event): void {
  if (event.eventType !== "workspace_browser_open_requested") return;
  const payload = asJsonObject(event.payload);
  if (
    !payload ||
    typeof payload.sessionGroupId !== "string" ||
    typeof payload.targetUserId !== "string" ||
    typeof payload.url !== "string" ||
    payload.targetUserId !== useAuthStore.getState().user?.id
  ) {
    return;
  }
  useWorkspaceRequestStore.getState().enqueueBrowserRequest({
    id: event.id,
    sessionGroupId: payload.sessionGroupId,
    url: payload.url,
  });
}
