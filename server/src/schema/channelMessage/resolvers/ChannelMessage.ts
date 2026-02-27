import type { ChannelMessageResolvers } from './../../types.generated';

export const ChannelMessage: ChannelMessageResolvers = {
  author: (parent) => {
    return parent.user;
  },
};
