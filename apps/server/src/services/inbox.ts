import { Prisma, type InboxItemStatus, type InboxItemType } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export interface CreateInboxItemInput {
  orgId: string;
  userId: string;
  itemType: InboxItemType;
  title: string;
  summary?: string;
  payload?: Prisma.InputJsonValue;
  sourceType: string;
  sourceId: string;
}

export class InboxService {
  async createItem(input: CreateInboxItemInput) {
    const item = await prisma.inboxItem.create({
      data: {
        organizationId: input.orgId,
        userId: input.userId,
        itemType: input.itemType,
        title: input.title,
        summary: input.summary,
        payload: input.payload ?? {},
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    });

    await eventService.create({
      organizationId: input.orgId,
      scopeType: "system",
      scopeId: input.orgId,
      eventType: "inbox_item_created",
      payload: { inboxItem: item } as unknown as Prisma.InputJsonValue,
      actorType: "system",
      actorId: "system",
    });

    return item;
  }

  async resolveBySource({
    sourceType,
    sourceId,
    orgId,
    resolution,
  }: {
    sourceType: string;
    sourceId: string;
    orgId: string;
    resolution?: string;
  }) {
    const items = await prisma.inboxItem.findMany({
      where: { organizationId: orgId, sourceType, sourceId, status: "active" },
    });

    const now = new Date();
    for (const item of items) {
      // Merge resolution into existing payload
      const existingPayload = (item.payload ?? {}) as Record<string, unknown>;
      const newPayload = { ...existingPayload, resolution: resolution ?? "resolved" };

      const updated = await prisma.inboxItem.update({
        where: { id: item.id },
        data: {
          status: "resolved",
          resolvedAt: now,
          payload: newPayload as unknown as Prisma.InputJsonValue,
        },
      });

      await eventService.create({
        organizationId: orgId,
        scopeType: "system",
        scopeId: orgId,
        eventType: "inbox_item_resolved",
        payload: { inboxItem: updated } as unknown as Prisma.InputJsonValue,
        actorType: "system",
        actorId: "system",
      });
    }
  }

  async dismiss(id: string, actorId: string, organizationId: string) {
    const item = await prisma.inboxItem.findFirstOrThrow({
      where: { id, userId: actorId, organizationId },
    });
    const existingPayload = (item.payload ?? {}) as Record<string, unknown>;
    const newPayload = { ...existingPayload, resolution: "dismissed" };

    const updated = await prisma.inboxItem.update({
      where: { id },
      data: {
        status: "dismissed",
        resolvedAt: new Date(),
        payload: newPayload as unknown as Prisma.InputJsonValue,
      },
    });

    await eventService.create({
      organizationId: updated.organizationId,
      scopeType: "system",
      scopeId: updated.organizationId,
      eventType: "inbox_item_resolved",
      payload: { inboxItem: updated } as unknown as Prisma.InputJsonValue,
      actorType: "user",
      actorId,
    });

    return updated;
  }

  async resolve(id: string, actorId: string, organizationId: string, resolution = "resolved") {
    const item = await prisma.inboxItem.findFirstOrThrow({
      where: { id, userId: actorId, organizationId },
    });
    const existingPayload = (item.payload ?? {}) as Record<string, unknown>;
    const newPayload = { ...existingPayload, resolution };

    const updated = await prisma.inboxItem.update({
      where: { id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        payload: newPayload as unknown as Prisma.InputJsonValue,
      },
    });

    await eventService.create({
      organizationId: updated.organizationId,
      scopeType: "system",
      scopeId: updated.organizationId,
      eventType: "inbox_item_resolved",
      payload: { inboxItem: updated } as unknown as Prisma.InputJsonValue,
      actorType: "user",
      actorId,
    });

    return updated;
  }

  async listForUser(orgId: string, userId: string, status?: InboxItemStatus) {
    const items = await prisma.inboxItem.findMany({
      where: {
        organizationId: orgId,
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return this.excludeArchivedSessionItems(items, orgId);
  }

  async countForUser(orgId: string, userId: string) {
    const baseWhere = { organizationId: orgId, userId, status: "active" as const };
    const [nonSessionCount, sessionItems] = await Promise.all([
      prisma.inboxItem.count({
        where: { ...baseWhere, sourceType: { not: "session" } },
      }),
      prisma.inboxItem.findMany({
        where: { ...baseWhere, sourceType: "session" },
        select: { sourceType: true, sourceId: true },
      }),
    ]);

    return nonSessionCount + (await this.excludeArchivedSessionItems(sessionItems, orgId)).length;
  }

  private async excludeArchivedSessionItems<T extends { sourceType: string; sourceId: string }>(
    items: T[],
    orgId: string,
  ): Promise<T[]> {
    const sessionIds = [
      ...new Set(
        items.filter((item) => item.sourceType === "session").map((item) => item.sourceId),
      ),
    ];
    if (sessionIds.length === 0) return items;

    const archivedSessions = await prisma.session.findMany({
      where: {
        organizationId: orgId,
        id: { in: sessionIds },
        sessionGroup: { archivedAt: { not: null } },
      },
      select: { id: true },
    });
    if (archivedSessions.length === 0) return items;

    const archivedSessionIds = new Set(archivedSessions.map((session) => session.id));
    return items.filter(
      (item) => item.sourceType !== "session" || !archivedSessionIds.has(item.sourceId),
    );
  }
}

export const inboxService = new InboxService();
