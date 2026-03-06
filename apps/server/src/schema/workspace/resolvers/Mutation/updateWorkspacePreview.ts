import type { MutationResolvers } from './../../../types.generated';
import { updateWorkspacePreviewAndImportance, getWorkspaceByIdForFeed } from '../../../../services/workspaceService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { GraphQLError } from 'graphql';

export const updateWorkspacePreview: NonNullable<MutationResolvers['updateWorkspacePreview']> = async (_parent, { channelId, workspaceId, preview }, _ctx) => {
  await updateWorkspacePreviewAndImportance(workspaceId, preview, 'normal');
  const workspace = await getWorkspaceByIdForFeed(workspaceId);
  if (!workspace) {
    throw new GraphQLError('Workspace not found', { extensions: { code: 'NOT_FOUND' } });
  }

  pubsub.publish(TOPICS.WORKSPACE_UPSERTED(channelId), {
    workspaceUpserted: workspace,
  });

  return workspace;
};
