import type { MutationResolvers } from './../../../types.generated';
import { updateChannel as updateChannelService } from '../../../../services/channelService';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const updateChannel: NonNullable<MutationResolvers['updateChannel']> = async (_parent, { id, name, workspacesEnabled, teamIds, baseBranch, githubUrl, defaultRepoPath, defaultSetupScript, defaultRunScript }, _ctx) => {
  const data: {
    name?: string;
    workspacesEnabled?: boolean;
    teamIds?: string[];
    baseBranch?: string | null;
    githubUrl?: string | null;
    defaultRepoPath?: string | null;
    defaultSetupScript?: string | null;
    defaultRunScript?: string | null;
  } = {};
  if (name !== undefined && name !== null) data.name = name;
  if (workspacesEnabled !== undefined && workspacesEnabled !== null) data.workspacesEnabled = workspacesEnabled;
  if (teamIds !== undefined && teamIds !== null) data.teamIds = teamIds;
  if (baseBranch !== undefined) data.baseBranch = baseBranch;
  if (githubUrl !== undefined) data.githubUrl = githubUrl;
  if (defaultRepoPath !== undefined) data.defaultRepoPath = defaultRepoPath;
  if (defaultSetupScript !== undefined) data.defaultSetupScript = defaultSetupScript;
  if (defaultRunScript !== undefined) data.defaultRunScript = defaultRunScript;
  const channel = await updateChannelService(id, data);
  void pubsub.publish(TOPICS.CHANNEL_CHANGED_SERVER(channel.serverId), {
    channelChangedInServer: { channelId: channel.id, action: 'updated' },
  });
  return channel;
};
