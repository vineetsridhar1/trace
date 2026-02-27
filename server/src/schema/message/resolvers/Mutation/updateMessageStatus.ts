import type { MutationResolvers } from './../../../types.generated';
import { updateMessageStatus as updateStatus, getMessageByIdForFeed } from '../../../../services/messageService';
import { pubsub, TOPICS } from '../../../../services/pubsub';
import { syncTicketWithMessageStatus, checkAndTriggerDependents } from '../../../../services/ticketService';
import { GraphQLError } from 'graphql';

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'creation', 'merged', 'needs_input', 'queued', 'auto_review'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['creation', 'in_progress', 'queued'],
  queued: ['creation', 'in_progress', 'pending'],
  creation: ['in_progress', 'pending'],
  in_progress: ['completed', 'needs_input', 'auto_review'],
  needs_input: ['in_progress'],
  auto_review: ['completed', 'in_progress', 'needs_input'],
  completed: ['merged', 'in_progress'],
  merged: ['completed'],
};

export const updateMessageStatus: NonNullable<MutationResolvers['updateMessageStatus']> = async (_parent, { channelId, messageId, status }, _ctx) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new GraphQLError(`status must be one of: ${VALID_STATUSES.join(', ')}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const current = await getMessageByIdForFeed(messageId);
  if (!current) {
    throw new GraphQLError('Message not found', { extensions: { code: 'NOT_FOUND' } });
  }

  const allowed = STATUS_TRANSITIONS[current.status];
  if (allowed && !allowed.includes(status)) {
    throw new GraphQLError(
      `Invalid status transition: ${current.status} → ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  await updateStatus(messageId, status);
  const message = await getMessageByIdForFeed(messageId);
  if (!message) {
    throw new GraphQLError('Message not found after update', { extensions: { code: 'NOT_FOUND' } });
  }

  pubsub.publish(TOPICS.MESSAGE_UPSERTED(channelId), {
    messageUpserted: message,
  });

  void syncTicketWithMessageStatus(messageId, channelId, status);

  if (status === 'merged') {
    void checkAndTriggerDependents(messageId, channelId);
  }

  return message;
};
