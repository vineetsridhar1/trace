import { Router, Request, Response } from 'express';
import { listSessions, getSession } from '../services/sessionService';
import { getEventsBySession } from '../services/eventService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await listSessions({
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      sort: req.query.sort as string | undefined,
      order: req.query.order as 'asc' | 'desc' | undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.sessionId as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) {
    console.error('Error fetching session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

router.get('/:sessionId/events', async (req: Request, res: Response) => {
  try {
    const result = await getEventsBySession(req.params.sessionId as string, {
      hookEventName: req.query.hookEventName as string | undefined,
      toolName: req.query.toolName as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      after: req.query.after as string | undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;
