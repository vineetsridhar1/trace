import type { MutationResolvers } from './../../../types.generated';
import { updateMessageStatus as updateStatus, getMessageByIdForFeed } from '../../../../services/messageService';
import { sseManager } from '../../../../services/sseManager';
import { syncTicketWithMessageStatus } from '../../../../services/ticketService';
import { GraphQLError } from 'graphql';

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'creation', 'merged', 'needs_input'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['creation', 'in_progress'],
  creation: ['in_progress', 'pending'],
  in_progress: ['completed', 'needs_input'],
  needs_input: ['in_progress'],
  completed: ['merged'],
  merged: [],
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

  sseManager.broadcastChannel(channelId, 'message-upsert', {
    channelId,
    message,
  });

  void syncTicketWithMessageStatus(messageId, channelId, status);

  return message;
};
