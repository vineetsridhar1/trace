export interface CreateChannelInput {
  organizationId: string;
  name: string;
  type?: string;
  projectIds?: string[];
}

export class ChannelService {
  async create(_input: CreateChannelInput) {
    throw new Error("Not implemented");
  }

  async sendMessage(_channelId: string, _text: string, _parentId: string | null, _actorType: string, _actorId: string) {
    throw new Error("Not implemented");
  }
}

export const channelService = new ChannelService();
