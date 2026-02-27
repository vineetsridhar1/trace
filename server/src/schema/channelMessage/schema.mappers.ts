export interface ChannelMessageMapper {
  id: string;
  channelId: string;
  content: string;
  createdAt: Date;
  user: { id: string; name: string; avatarUrl: string | null };
}

export interface ChannelMessageAuthorMapper {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ChannelMessageConnectionMapper {
  messages: ChannelMessageMapper[];
  total: number;
  limit: number;
  offset: number;
}
