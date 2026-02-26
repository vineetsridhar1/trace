import type { MutationResolvers } from './../../../types.generated';
import { updateChannel as updateChannelService } from '../../../../services/channelService';

export const updateChannel: NonNullable<MutationResolvers['updateChannel']> = async (_parent, { id, name, baseBranch, githubUrl, defaultRepoPath, defaultSetupScript, defaultRunScript }, _ctx) => {
  const data: {
    name?: string;
    baseBranch?: string | null;
    githubUrl?: string | null;
    defaultRepoPath?: string | null;
    defaultSetupScript?: string | null;
    defaultRunScript?: string | null;
  } = {};
  if (name !== undefined && name !== null) data.name = name;
  if (baseBranch !== undefined) data.baseBranch = baseBranch;
  if (githubUrl !== undefined) data.githubUrl = githubUrl;
  if (defaultRepoPath !== undefined) data.defaultRepoPath = defaultRepoPath;
  if (defaultSetupScript !== undefined) data.defaultSetupScript = defaultSetupScript;
  if (defaultRunScript !== undefined) data.defaultRunScript = defaultRunScript;
  return updateChannelService(id, data);
};
