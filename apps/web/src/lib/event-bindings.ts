import { setOrgEventUIBindings } from "@trace/client-core";
import { navigateToSession, useUIStore } from "../stores/ui";

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
  navigateToSession: (channelId, sessionGroupId, sessionId) =>
    navigateToSession(channelId, sessionGroupId, sessionId),
});
