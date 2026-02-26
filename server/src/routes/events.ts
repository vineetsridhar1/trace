import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { HookEventSchema } from '../types/hookEvents';
import { ingestEvent, getEventById, updateStopEventUsage } from '../services/eventService';

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

router.patch('/usage', async (req: Request, res: Response) => {
  try {
    const { message_id, cli_usage, cli_cost_usd } = req.body;
    if (!message_id || !cli_usage) {
      res.status(400).json({ error: 'message_id and cli_usage are required' });
      return;
    }
    const result = await updateStopEventUsage(message_id, cli_usage, cli_cost_usd);
    if (!result) {
      res.status(404).json({ error: 'Stop event not found for message' });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    console.error('Error patching usage:', err);
    res.status(500).json({ error: 'Failed to patch usage' });
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
