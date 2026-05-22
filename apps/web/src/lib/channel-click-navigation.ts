import { useUIStore } from "../stores/ui";

export function selectChannel(channelId: string): void {
  useUIStore.getState().setActiveChannelId(channelId);
}
