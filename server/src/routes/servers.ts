import { Router, Request, Response } from 'express';
import { listServers, createServer } from '../services/serverService';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const servers = await listServers();
  res.json({ servers });
});

router.post('/', async (req: Request, res: Response) => {
  const { name, avatarUrl } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const server = await createServer({
    name,
    avatarUrl: avatarUrl || null,
  });
  res.status(201).json({ server });
});

export default router;
