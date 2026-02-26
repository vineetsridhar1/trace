import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { HookEventSchema } from '../types/hookEvents';
import { ingestEvent, getEventById } from '../services/eventService';

const router = Router();

router.post('/', validate(HookEventSchema), async (req: Request, res: Response) => {
  try {
    const result = await ingestEvent(req.body);
    if (!result) {
      res.status(204).end();
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    console.error('Error ingesting event:', err);
    res.status(500).json({ error: 'Failed to ingest event' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const event = await getEventById(req.params.id as string);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(event);
  } catch (err) {
    console.error('Error fetching event:', err);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

export default router;
