import type { MutationResolvers } from './../../../types.generated';
import { GraphQLError } from 'graphql';
import { importTicketsToProject as importTicketsService } from '../../../../services/ticketService';

export const importTicketsToProject: NonNullable<MutationResolvers['importTicketsToProject']> = async (
  _parent,
  { channelId, tickets, runConfig },
  _ctx,
) => {
  if (!runConfig || typeof runConfig !== 'object' || Array.isArray(runConfig)) {
    throw new GraphQLError('runConfig must be a non-null JSON object', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return importTicketsService(channelId, tickets, runConfig as object);
};
