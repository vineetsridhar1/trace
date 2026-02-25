import type { QueryResolvers } from './../../../types.generated';
import { listChannels } from '../../../../services/channelService';

export const channels: NonNullable<QueryResolvers['channels']> = async (_parent, _arg, _ctx) => {
  return listChannels();
};
