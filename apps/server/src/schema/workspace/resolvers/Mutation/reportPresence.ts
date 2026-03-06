import type { MutationResolvers } from './../../../types.generated';
import { requireAuth } from '../../../../lib/requireAuth';
import { setPresence, clearPresence, getChannelPresence } from '../../../../services/presenceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import prisma from '../../../../lib/prisma';

export const reportPresence: NonNullable<MutationResolvers['reportPresence']> = async (_parent, { channelId, workspaceId }, ctx) => {
  const user = requireAuth(ctx);

  if (workspaceId) {
    // Look up avatar from DB since requireAuth doesn't include it
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });

    const { changed } = setPresence(channelId, user.id, workspaceId, user.name, dbUser?.avatarUrl ?? null);

    if (changed) {
      const presence = getChannelPresence(channelId);
      pubsub.publish(TOPICS.PRESENCE_UPDATED(channelId), {
        presenceUpdated: { channelId, presence },
      });
    }
  } else {
    const prevWorkspaceId = clearPresence(channelId, user.id);

    if (prevWorkspaceId) {
      const presence = getChannelPresence(channelId);
      pubsub.publish(TOPICS.PRESENCE_UPDATED(channelId), {
        presenceUpdated: { channelId, presence },
      });
    }
  }

  return true;
};
