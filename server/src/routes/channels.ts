import { Router, Request, Response } from 'express';
import {
  listChannels,
  getChannel,
  updateChannel,
  listStartupScripts,
  createStartupScript,
  updateStartupScript,
  deleteStartupScript,
} from '../services/channelService';
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
import { createTicketForMessage, syncTicketWithMessageStatus } from '../services/ticketService';

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

router.patch('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { name, cwd, creationScript } = req.body;
  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' });
    return;
  }
  if (cwd !== undefined && cwd !== null && typeof cwd !== 'string') {
    res.status(400).json({ error: 'cwd must be a string or null' });
    return;
  }
  if (creationScript !== undefined && creationScript !== null && typeof creationScript !== 'string') {
    res.status(400).json({ error: 'creationScript must be a string or null' });
    return;
  }
  const data: { name?: string; cwd?: string | null; creationScript?: string | null } = {};
  if (name !== undefined) data.name = name;
  if (cwd !== undefined) data.cwd = cwd;
  if (creationScript !== undefined) data.creationScript = creationScript;
  const channel = await updateChannel(req.params.id, data);
  res.json(channel);
});

router.get('/:id/startup-scripts', async (req: Request<{ id: string }>, res: Response) => {
  const scripts = await listStartupScripts(req.params.id);
  res.json({ scripts });
});

router.post('/:id/startup-scripts', async (req: Request<{ id: string }>, res: Response) => {
  const { name, command, scriptType } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!command || typeof command !== 'string') {
    res.status(400).json({ error: 'command is required' });
    return;
  }
  if (scriptType !== undefined && scriptType !== 'creation' && scriptType !== 'startup') {
    res.status(400).json({ error: 'scriptType must be "creation" or "startup"' });
    return;
  }
  const script = await createStartupScript(req.params.id, { name, command, scriptType });
  res.status(201).json(script);
});

router.patch(
  '/:id/startup-scripts/:scriptId',
  async (req: Request<{ id: string; scriptId: string }>, res: Response) => {
    const { name, command, scriptType, sortOrder } = req.body;
    const data: { name?: string; command?: string; scriptType?: string; sortOrder?: number } = {};
    if (name !== undefined) data.name = name;
    if (command !== undefined) data.command = command;
    if (scriptType !== undefined) data.scriptType = scriptType;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    const script = await updateStartupScript(req.params.scriptId, data);
    res.json(script);
  },
);

router.delete(
  '/:id/startup-scripts/:scriptId',
  async (req: Request<{ id: string; scriptId: string }>, res: Response) => {
    await deleteStartupScript(req.params.scriptId);
    res.status(204).send();
  },
);

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

  // Fire-and-forget: create a kanban ticket for this message
  const channel = await getChannel(req.params.id);
  void createTicketForMessage(
    created.message.id,
    req.params.id,
    text.trim(),
    channel?.name ?? 'general',
  );

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

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'creation'];

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

    // Sync kanban ticket with message status
    void syncTicketWithMessageStatus(req.params.messageId, req.params.channelId, status);

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
