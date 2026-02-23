import { Router, Request, Response } from 'express';
import { listChannels, getChannel } from '../services/channelService';
import {
  getMessagesByChannel,
  getThreadsByMessage,
  getEventsByThread,
  createUserMessage,
  appendPromptToMessageThread,
  updateMessageStatus,
  updateMessagePreviewAndImportance,
  getMessageByIdForFeed,
} from '../services/messageService';
import { sseManager } from '../services/sseManager';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const channels = await listChannels();
  res.json({ channels });
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const channel = await getChannel(req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  res.json(channel);
});

router.get('/:id/messages', async (req: Request<{ id: string }>, res: Response) => {
  const { limit, offset } = req.query;
  const result = await getMessagesByChannel(req.params.id, {
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  res.json(result);
});

router.post('/:id/messages', async (req: Request<{ id: string }>, res: Response) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  const created = await createUserMessage(req.params.id, text.trim());

  sseManager.broadcastChannel(req.params.id, 'message-created', {
    channelId: req.params.id,
    message: created.message,
  });
  sseManager.broadcastChannel(req.params.id, 'message-upsert', {
    channelId: req.params.id,
    message: created.message,
  });
  sseManager.broadcastChannel(req.params.id, 'thread-event-created', {
    channelId: req.params.id,
    messageId: created.message.id,
    threadId: created.thread.id,
    event: created.event,
  });
  sseManager.broadcastChannel(req.params.id, 'message-update', {
    messageId: created.message.id,
    channelId: req.params.id,
  });
  sseManager.broadcastChannel(req.params.id, 'new-event', created.event);

  res.status(201).json(created);
});

router.post(
  '/:channelId/messages/:messageId/prompts',
  async (req: Request<{ channelId: string; messageId: string }>, res: Response) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const created = await appendPromptToMessageThread(
      req.params.channelId,
      req.params.messageId,
      text.trim(),
    );

    if (!created) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    sseManager.broadcastChannel(req.params.channelId, 'message-upsert', {
      channelId: req.params.channelId,
      message: created.message,
    });
    sseManager.broadcastChannel(req.params.channelId, 'thread-event-created', {
      channelId: req.params.channelId,
      messageId: created.message.id,
      threadId: created.thread.id,
      event: created.event,
    });
    sseManager.broadcastChannel(req.params.channelId, 'message-update', {
      messageId: created.message.id,
      channelId: req.params.channelId,
    });
    sseManager.broadcastChannel(req.params.channelId, 'new-event', created.event);

    res.status(201).json(created);
  },
);

router.patch(
  '/:channelId/messages/:messageId/preview',
  async (req: Request<{ channelId: string; messageId: string }>, res: Response) => {
    const { preview } = req.body;
    if (typeof preview !== 'string') {
      res.status(400).json({ error: 'preview must be a string' });
      return;
    }

    await updateMessagePreviewAndImportance(req.params.messageId, preview, 'normal');
    const message = await getMessageByIdForFeed(req.params.messageId);
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    sseManager.broadcastChannel(req.params.channelId, 'message-upsert', {
      channelId: req.params.channelId,
      message,
    });

    res.json({ message });
  },
);

const VALID_STATUSES = ['pending', 'in_progress', 'completed'];

router.patch(
  '/:channelId/messages/:messageId/status',
  async (req: Request<{ channelId: string; messageId: string }>, res: Response) => {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }

    await updateMessageStatus(req.params.messageId, status);
    const message = await getMessageByIdForFeed(req.params.messageId);
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    sseManager.broadcastChannel(req.params.channelId, 'message-upsert', {
      channelId: req.params.channelId,
      message,
    });

    res.json({ message });
  },
);

router.get(
  '/:channelId/messages/:messageId/threads',
  async (req: Request<{ channelId: string; messageId: string }>, res: Response) => {
    const threads = await getThreadsByMessage(req.params.messageId);
    res.json({ threads });
  },
);

router.get(
  '/:channelId/messages/:messageId/threads/:threadId/events',
  async (
    req: Request<{ channelId: string; messageId: string; threadId: string }>,
    res: Response,
  ) => {
    const { limit, offset, after } = req.query;
    const result = await getEventsByThread(req.params.threadId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      after: after as string | undefined,
    });
    res.json(result);
  },
);

export default router;
