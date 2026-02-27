import type { MutationResolvers } from './../../../types.generated';
import { deleteChannel as deleteChannelService } from '../../../../services/channelService';

export const deleteChannel: NonNullable<MutationResolvers['deleteChannel']> = async (_parent, { id }, _ctx) => {
  await deleteChannelService(id);
  return true;
};
