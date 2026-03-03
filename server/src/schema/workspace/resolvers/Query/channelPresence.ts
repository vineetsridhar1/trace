import type { QueryResolvers } from './../../../types.generated';
import { getChannelPresence } from '../../../../services/presenceService';

export const channelPresence: NonNullable<QueryResolvers['channelPresence']> = async (_parent, { channelId }) => {
  return getChannelPresence(channelId);
};
