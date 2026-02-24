import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  getBoard,
  createColumn,
  updateColumn,
  deleteColumn,
  moveTicket,
} from '../services/ticketService';
import { getStorage } from '../services/storageService';

const router = Router();

function resolveAttachmentUrls(columns: Awaited<ReturnType<typeof getBoard>>) {
  const storage = getStorage();
  return columns.map((col) => ({
    ...col,
    tickets: col.tickets.map((ticket) => ({
      ...ticket,
      message: {
        ...ticket.message,
        attachments: ticket.message.attachments.map((a) => ({
          ...a,
          url: storage.url(a.key),
        })),
      },
    })),
  }));
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

// GET /:id/board - get full kanban board
router.get('/:id/board', async (req: Request<{ id: string }>, res: Response) => {
  const board = await getBoard(req.params.id);
  res.json({ columns: resolveAttachmentUrls(board) });
});

// POST /:id/board/columns - create column
router.post('/:id/board/columns', async (req: Request<{ id: string }>, res: Response) => {
  const { name, slug, color } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'slug is required' });
    return;
  }
  const column = await createColumn(req.params.id, name, slug, color);
  res.status(201).json(column);
});

// PATCH /:id/board/columns/:columnId - update column
router.patch(
  '/:id/board/columns/:columnId',
  async (req: Request<{ id: string; columnId: string }>, res: Response) => {
    const { name, color, sortOrder } = req.body;
    const data: { name?: string; color?: string; sortOrder?: number } = {};
    if (name !== undefined) data.name = name;
    if (color !== undefined) data.color = color;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    try {
      const column = await updateColumn(req.params.columnId, data);
      res.json(column);
    } catch (error) {
      if (isNotFound(error)) {
        res.status(404).json({ error: 'Column not found' });
        return;
      }
      throw error;
    }
  },
);

// DELETE /:id/board/columns/:columnId - delete column
router.delete(
  '/:id/board/columns/:columnId',
  async (req: Request<{ id: string; columnId: string }>, res: Response) => {
    try {
      await deleteColumn(req.params.columnId);
      res.status(204).send();
    } catch (error) {
      if (isNotFound(error)) {
        res.status(404).json({ error: 'Column not found' });
        return;
      }
      throw error;
    }
  },
);

// PATCH /:id/board/tickets/:ticketId/move - move ticket between columns
router.patch(
  '/:id/board/tickets/:ticketId/move',
  async (req: Request<{ id: string; ticketId: string }>, res: Response) => {
    const { columnId, sortOrder } = req.body;
    if (!columnId || typeof columnId !== 'string') {
      res.status(400).json({ error: 'columnId is required' });
      return;
    }
    try {
      const ticket = await moveTicket(req.params.ticketId, columnId, sortOrder ?? 0);
      res.json(ticket);
    } catch (error) {
      if (isNotFound(error)) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }
      throw error;
    }
  },
);

export default router;
