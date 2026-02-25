import type { QueryResolvers } from './../../../types.generated';
import { getChannel } from '../../../../services/channelService';

export const channel: NonNullable<QueryResolvers['channel']> = async (_parent, { id }, _ctx) => {
  return getChannel(id);
};
