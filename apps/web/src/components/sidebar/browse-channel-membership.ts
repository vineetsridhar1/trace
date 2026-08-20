import type { ChannelType, ChannelVisibility } from "@trace/gql";

export interface BrowseChannel {
  id: string;
  name: string;
  type: ChannelType;
  visibility: ChannelVisibility;
  memberCount: number;
  viewerIsMember: boolean;
}

export function updateBrowseChannelMembership(
  channels: BrowseChannel[],
  channelId: string,
  viewerIsMember: boolean,
): BrowseChannel[] {
  return channels.map((channel) =>
    channel.id === channelId
      ? {
          ...channel,
          viewerIsMember,
          memberCount: Math.max(0, channel.memberCount + (viewerIsMember ? 1 : -1)),
        }
      : channel,
  );
}
