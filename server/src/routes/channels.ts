import { Router, Request, Response } from 'express';
import {
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
} from '../services/channelService';
import { validateGitRepo, getOriginRemoteUrl, listBranches } from '../services/gitService';
import { getOrCreateDefaultServer } from '../services/serverService';
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

router.post('/', async (req: Request, res: Response) => {
  const { name, githubUrl, baseBranch, serverId } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const resolvedServerId = serverId || await getOrCreateDefaultServer();

  const channel = await createChannel({
    name,
    serverId: resolvedServerId,
    baseBranch: baseBranch || 'main',
    githubUrl: githubUrl || null,
  });
  res.status(201).json({ channel });
});

router.post('/validate-repo', async (req: Request, res: Response) => {
  const { localRepoPath } = req.body;
  if (!localRepoPath || typeof localRepoPath !== 'string') {
    res.json({ valid: false, error: 'Path is required' });
    return;
  }

  const validation = await validateGitRepo(localRepoPath);
  if (!validation.valid) {
    res.json({ valid: false, error: validation.error });
    return;
  }

  const originUrl = await getOriginRemoteUrl(localRepoPath);
  if (!originUrl) {
    res.json({ valid: false, error: 'No origin remote found. Please add an origin remote to this repository.' });
    return;
  }

  res.json({ valid: true, originUrl });
});

router.post('/validate-repo/branches', async (req: Request, res: Response) => {
  const { localRepoPath } = req.body;
  if (!localRepoPath || typeof localRepoPath !== 'string') {
    res.json({ branches: [] });
    return;
  }

  const branches = await listBranches(localRepoPath);
  res.json({ branches });
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
  const { name, baseBranch, githubUrl } = req.body;
  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' });
    return;
  }
  if (baseBranch !== undefined && baseBranch !== null && typeof baseBranch !== 'string') {
    res.status(400).json({ error: 'baseBranch must be a string or null' });
    return;
  }
  if (githubUrl !== undefined && githubUrl !== null && typeof githubUrl !== 'string') {
    res.status(400).json({ error: 'githubUrl must be a string or null' });
    return;
  }
  const data: { name?: string; baseBranch?: string | null; githubUrl?: string | null } = {};
  if (name !== undefined) data.name = name;
  if (baseBranch !== undefined) data.baseBranch = baseBranch;
  if (githubUrl !== undefined) data.githubUrl = githubUrl;
  const channel = await updateChannel(req.params.id, data);
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
  const { text, attachmentIds } = req.body;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  const created = await createUserMessage(req.params.id, text.trim(), attachmentIds);

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
    const { text, attachmentIds } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const created = await appendPromptToMessageThread(
      req.params.channelId,
      req.params.messageId,
      text.trim(),
      attachmentIds,
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
