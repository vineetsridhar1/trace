import type { MutationResolvers } from './../../../types.generated';
import { createChannel as createChannelService } from '../../../../services/channelService';
import { getOrCreateDefaultServer } from '../../../../services/serverService';

export const createChannel: NonNullable<MutationResolvers['createChannel']> = async (_parent, { name, serverId, type, workspacesEnabled, teamIds, githubUrl, baseBranch, defaultSetupScript, defaultRunScript }, _ctx) => {
  const resolvedServerId = serverId || await getOrCreateDefaultServer();
  return createChannelService({
    name,
    serverId: resolvedServerId,
    type: type || 'project',
    workspacesEnabled: workspacesEnabled ?? true,
    teamIds: teamIds ?? undefined,
    baseBranch: baseBranch || 'main',
    githubUrl: githubUrl || null,
    defaultSetupScript: defaultSetupScript || null,
    defaultRunScript: defaultRunScript || null,
  });
};
