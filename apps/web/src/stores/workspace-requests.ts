import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { useAuthStore } from "@trace/client-core";
import { create } from "zustand";

export type WorkspaceBrowserRequest = {
  id: string;
  sessionGroupId: string;
  url: string;
};

export type WorkspaceTerminalRequest = {
  id: string;
  sessionGroupId: string;
  sessionId: string;
  terminalId: string;
  replaceTabId?: string;
  select: boolean;
};

type WorkspaceRequestState = {
  browserRequestsByGroup: Record<string, WorkspaceBrowserRequest[]>;
  terminalRequestsByGroup: Record<string, WorkspaceTerminalRequest[]>;
  enqueueBrowserRequest: (request: WorkspaceBrowserRequest) => void;
  enqueueTerminalRequest: (request: WorkspaceTerminalRequest) => void;
  consumeBrowserRequests: (sessionGroupId: string) => void;
  consumeTerminalRequests: (sessionGroupId: string) => void;
};

export const useWorkspaceRequestStore = create<WorkspaceRequestState>((set) => ({
  browserRequestsByGroup: {},
  terminalRequestsByGroup: {},
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
  enqueueTerminalRequest: (request) =>
    set((state) => {
      const existing = state.terminalRequestsByGroup[request.sessionGroupId] ?? [];
      if (existing.some((candidate) => candidate.id === request.id)) return state;
      return {
        terminalRequestsByGroup: {
          ...state.terminalRequestsByGroup,
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
  consumeTerminalRequests: (sessionGroupId) =>
    set((state) => {
      if (!state.terminalRequestsByGroup[sessionGroupId]?.length) return state;
      const next = { ...state.terminalRequestsByGroup };
      delete next[sessionGroupId];
      return { terminalRequestsByGroup: next };
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
