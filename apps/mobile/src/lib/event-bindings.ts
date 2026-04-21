import { setOrgEventUIBindings } from "@trace/client-core";
import { router } from "expo-router";
import { useMobileUIStore } from "@/stores/ui";

setOrgEventUIBindings({
  getActiveChannelId: () => useMobileUIStore.getState().activeChannelId,
  getActiveSessionId: () => useMobileUIStore.getState().activeSessionId,
  getActiveSessionGroupId: () => useMobileUIStore.getState().activeSessionGroupId,
  setActiveChannelId: (id) => useMobileUIStore.getState().setActiveChannelId(id),
  setActiveSessionId: (id) => useMobileUIStore.getState().setActiveSessionId(id),
  setActiveSessionGroupId: (id) => useMobileUIStore.getState().setActiveSessionGroupId(id),
  markChannelDone: (id) => useMobileUIStore.getState().markChannelDone(id),
  markSessionDone: (id) => useMobileUIStore.getState().markSessionDone(id),
  markSessionGroupDone: (id) => useMobileUIStore.getState().markSessionGroupDone(id),
  // Mobile has no tab metaphor — group detail navigation is the tab.
  openSessionTab: () => {},
  navigateToSession: (_channelId, sessionGroupId, sessionId) => {
    router.push(`/sessions/${sessionGroupId}/${sessionId}` as never);
  },
});
