import { Router, Request, Response } from 'express';
import { getStorage, generateStorageKey, computeChecksum } from '../services/storageService';
import prisma from '../lib/prisma';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { data, filename, contentType } = req.body;
  if (!data || typeof data !== 'string') {
    res.status(400).json({ error: 'data (base64) is required' });
    return;
  }
  if (!filename || typeof filename !== 'string') {
    res.status(400).json({ error: 'filename is required' });
    return;
  }
  if (!contentType || typeof contentType !== 'string') {
    res.status(400).json({ error: 'contentType is required' });
    return;
  }

  const buffer = Buffer.from(data, 'base64');
  const storage = getStorage();
  const key = generateStorageKey(buffer, filename);
  const checksum = computeChecksum(buffer);

  const existing = await prisma.attachment.findUnique({ where: { key } });
  if (existing) {
    res.status(200).json({
      attachment: {
        ...existing,
        url: storage.url(key),
        localPath: storage.localPath(key),
      },
    });
    return;
  }

  await storage.store(key, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      key,
      filename,
      contentType,
      byteSize: buffer.length,
      checksum,
    },
  });

  res.status(201).json({
    attachment: {
      ...attachment,
      url: storage.url(key),
      localPath: storage.localPath(key),
    },
  });
});

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
