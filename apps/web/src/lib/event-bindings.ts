import { setOrgEventUIBindings } from "@trace/client-core";
import { navigateToSession, useUIStore } from "../stores/ui";
import { buildPath } from "../stores/ui-navigation";

setOrgEventUIBindings({
  getActiveChannelId: () => useUIStore.getState().activeChannelId,
  getActiveSessionId: () => useUIStore.getState().activeSessionId,
  getActiveSessionGroupId: () => useUIStore.getState().activeSessionGroupId,
  setActiveChannelId: (id) => useUIStore.getState().setActiveChannelId(id),
  setActiveSessionId: (id) => useUIStore.getState().setActiveSessionId(id),
  setActiveSessionGroupId: (id) => useUIStore.getState().setActiveSessionGroupId(id),
  markChannelDone: (id) => useUIStore.getState().markChannelDone(id),
  markSessionDone: (id) => useUIStore.getState().markSessionDone(id),
  markSessionGroupDone: (id) => useUIStore.getState().markSessionGroupDone(id),
  openSessionTab: (groupId, sessionId) => useUIStore.getState().openSessionTab(groupId, sessionId),
  hideSessionTab: (groupId, sessionId, hiddenAt) =>
    useUIStore.getState().hideSessionTab(groupId, sessionId, hiddenAt),
  restoreSessionTab: (groupId, sessionId) =>
    useUIStore.getState().restoreSessionTab(groupId, sessionId),
  reconcileSessionGroupMove: (channelId, sessionGroupId) => {
    const state = useUIStore.getState();
    const sessionId = state.activeSessionGroupId === sessionGroupId ? state.activeSessionId : null;
    state._restoreNav(channelId, sessionGroupId, sessionId, "main", null, null);
    history.replaceState(
      {
        channelId,
        sessionGroupId,
        sessionId,
        page: "main",
        chatId: null,
        channelSubPage: null,
      },
      "",
      buildPath(channelId, sessionGroupId, sessionId),
    );
  },
  navigateToSession: (channelId, sessionGroupId, sessionId) =>
    navigateToSession(channelId, sessionGroupId, sessionId),
});
