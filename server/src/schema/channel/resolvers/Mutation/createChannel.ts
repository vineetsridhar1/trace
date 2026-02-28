import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { createChannel as createChannelService } from '../../../../services/channelService';
import { getOrCreateDefaultServer } from '../../../../services/serverService';

export const createChannel: NonNullable<MutationResolvers['createChannel']> = async (_parent, { name, serverId, type, workspacesEnabled, teamIds, githubUrl, baseBranch, defaultSetupScript, defaultRunScript }, _ctx) => {
  let resolvedServerId = serverId || await getOrCreateDefaultServer();
  if (serverId) {
    const exists = await prisma.server.findUnique({ where: { id: serverId }, select: { id: true } });
    if (!exists) resolvedServerId = await getOrCreateDefaultServer();
  }
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
