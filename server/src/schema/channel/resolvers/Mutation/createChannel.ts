import type { MutationResolvers } from './../../../types.generated';
import { createChannel as createChannelService } from '../../../../services/channelService';
import { getOrCreateDefaultServer } from '../../../../services/serverService';

export const createChannel: NonNullable<MutationResolvers['createChannel']> = async (_parent, { name, serverId, githubUrl, baseBranch, defaultSetupScript, defaultRunScript }, _ctx) => {
  const resolvedServerId = serverId || await getOrCreateDefaultServer();
  return createChannelService({
    name,
    serverId: resolvedServerId,
    baseBranch: baseBranch || 'main',
    githubUrl: githubUrl || null,
    defaultSetupScript: defaultSetupScript || null,
    defaultRunScript: defaultRunScript || null,
  });
};
