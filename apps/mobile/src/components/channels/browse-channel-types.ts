import type { ChannelType } from "@trace/gql";

export interface BrowseChannel {
  id: string;
  name: string;
  type: ChannelType;
  memberCount: number;
  viewerIsMember: boolean;
}
