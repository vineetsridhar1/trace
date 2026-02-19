import { Router, Request, Response } from 'express';
import { sseManager } from '../services/sseManager';

const router = Router();

router.get('/sessions/:sessionId', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('event: connected\ndata: {}\n\n');

  sseManager.addClient(req.params.sessionId as string, res);
});

export default router;
