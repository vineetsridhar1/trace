import type { MutationResolvers } from './../../../types.generated';
import prisma from '../../../../lib/prisma';
import { createChannel as createChannelService, joinChannel as joinChannelService } from '../../../../services/channelService';
import { getOrCreateDefaultServer } from '../../../../services/serverService';
import { pubsub, TOPICS } from '../../../../services/pubsub';

export const createChannel: NonNullable<MutationResolvers['createChannel']> = async (_parent, { name, serverId, type, workspacesEnabled, teamIds, githubUrl, baseBranch, defaultSetupScript, defaultRunScript, defaultTeardownScript }, ctx) => {
  let resolvedServerId = serverId || await getOrCreateDefaultServer();
  if (serverId) {
    const exists = await prisma.server.findUnique({ where: { id: serverId }, select: { id: true } });
    if (!exists) resolvedServerId = await getOrCreateDefaultServer();
  }
  const channel = await createChannelService({
    name,
    serverId: resolvedServerId,
    type: type || 'project',
    workspacesEnabled: workspacesEnabled ?? true,
    teamIds: teamIds ?? undefined,
    baseBranch: baseBranch || 'main',
    githubUrl: githubUrl || null,
    defaultSetupScript: defaultSetupScript || null,
    defaultRunScript: defaultRunScript || null,
    defaultTeardownScript: defaultTeardownScript || null,
  });
  // Auto-join the creator as a member
  const user = (ctx as { user?: { id: string } }).user;
  if (user) {
    await joinChannelService(channel.id, user.id);
  }

  void pubsub.publish(TOPICS.CHANNEL_CHANGED_SERVER(resolvedServerId), {
    channelChangedInServer: { channelId: channel.id, action: 'created' },
  });
  return channel;
};
