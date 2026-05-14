import { useEntityStore } from "@trace/client-core";
import { createQuickSession } from "./create-quick-session";
import { useUIStore } from "../stores/ui";

export function selectChannelOrStartSession(channelId: string): void {
  const state = useUIStore.getState();
  const channel = useEntityStore.getState().channels[channelId];

  if (!state.activeSessionGroupId && channel?.type !== "text") {
    void createQuickSession(channelId);
    return;
  }

  state.setActiveChannelId(channelId);
}
