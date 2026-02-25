import { Router, Request, Response } from 'express';
import { getStorage } from '../services/storageService';
import prisma from '../lib/prisma';

const router = Router();

router.get('/file/:key', async (req: Request<{ key: string }>, res: Response) => {
  const storage = getStorage();
  const fileExists = await storage.exists(req.params.key);
  if (!fileExists) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const attachment = await prisma.attachment.findUnique({
    where: { key: req.params.key },
  });

  const buffer = await storage.retrieve(req.params.key);
  res.setHeader('Content-Type', attachment?.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(buffer);
});

export default router;
