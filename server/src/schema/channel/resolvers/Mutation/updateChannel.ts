import type { MutationResolvers } from './../../../types.generated';
import { updateChannel as updateChannelService } from '../../../../services/channelService';

export const updateChannel: NonNullable<MutationResolvers['updateChannel']> = async (_parent, { id, name, baseBranch, githubUrl }, _ctx) => {
  const data: { name?: string; baseBranch?: string | null; githubUrl?: string | null } = {};
  if (name !== undefined && name !== null) data.name = name;
  if (baseBranch !== undefined) data.baseBranch = baseBranch;
  if (githubUrl !== undefined) data.githubUrl = githubUrl;
  return updateChannelService(id, data);
};
