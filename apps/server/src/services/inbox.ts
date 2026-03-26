import type { InboxItemType, InboxItemStatus, Prisma } from "@prisma/client";
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
      where: { sourceType, sourceId, status: "active" },
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

  async listForUser(orgId: string, userId: string, status?: InboxItemStatus) {
    return prisma.inboxItem.findMany({
      where: {
        organizationId: orgId,
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async countForUser(orgId: string, userId: string) {
    return prisma.inboxItem.count({
      where: {
        organizationId: orgId,
        userId,
        status: "active",
      },
    });
  }

  /**
   * Load an active suggestion and verify ownership. Does NOT modify it.
   * Use this to read the payload before deciding to execute.
   */
  async getActiveSuggestion(id: string, actorId: string, organizationId: string) {
    return prisma.inboxItem.findFirstOrThrow({
      where: { id, userId: actorId, organizationId, status: "active" },
    });
  }

  /**
   * Accept an agent suggestion. Marks it as resolved with resolution "accepted".
   * Returns the updated inbox item with original payload intact.
   * Call this AFTER the action has been successfully executed.
   */
  async acceptSuggestion(id: string, actorId: string, organizationId: string) {
    const item = await prisma.inboxItem.findFirstOrThrow({
      where: { id, userId: actorId, organizationId, status: "active" },
    });

    const existingPayload = (item.payload ?? {}) as Record<string, unknown>;
    const updatedPayload = { ...existingPayload, resolution: "accepted" };

    const updated = await prisma.inboxItem.update({
      where: { id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        payload: updatedPayload as unknown as Prisma.InputJsonValue,
      },
    });

    await eventService.create({
      organizationId: updated.organizationId,
      scopeType: "system",
      scopeId: updated.organizationId,
      eventType: "inbox_item_resolved",
      payload: { inboxItem: updated, resolution: "accepted" } as unknown as Prisma.InputJsonValue,
      actorType: "user",
      actorId,
    });

    return updated;
  }

  /**
   * Dismiss an agent suggestion and record the action type for dismissal cooldown.
   */
  async dismissSuggestion(id: string, actorId: string, organizationId: string) {
    const item = await prisma.inboxItem.findFirstOrThrow({
      where: { id, userId: actorId, organizationId, status: "active" },
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
      payload: { inboxItem: updated, resolution: "dismissed" } as unknown as Prisma.InputJsonValue,
      actorType: "user",
      actorId,
    });

    return updated;
  }

  /**
   * Find active suggestions in a given scope with a specific item type.
   * Used by semantic deduplication to check for existing similar suggestions.
   */
  async findActiveSuggestionsByScope(input: {
    orgId: string;
    scopeType: string;
    scopeId: string;
    itemType: InboxItemType;
  }) {
    return prisma.inboxItem.findMany({
      where: {
        organizationId: input.orgId,
        itemType: input.itemType,
        status: "active",
        sourceType: "agent_suggestion",
        AND: [
          { payload: { path: ["scopeType"], equals: input.scopeType } },
          { payload: { path: ["scopeId"], equals: input.scopeId } },
        ],
      },
      select: { id: true, title: true, payload: true },
    });
  }

  /**
   * Expire suggestions past their expiresAt timestamp.
   * Called by a periodic background job.
   */
  async expireSuggestions() {
    const now = new Date();
    const nowIso = now.toISOString();
    type ExpirableSuggestionRow = {
      id: string;
      organizationId: string;
      payload: Prisma.JsonValue | null;
    };

    // `expiresAt` is stored as an ISO timestamp, so string comparison preserves time order.
    const items = await prisma.$queryRaw<ExpirableSuggestionRow[]>`
      SELECT "id", "organizationId", "payload"
      FROM "InboxItem"
      WHERE "status" = 'active'
        AND "itemType" IN (
          ${"ticket_suggestion"},
          ${"link_suggestion"},
          ${"session_suggestion"},
          ${"field_change_suggestion"},
          ${"comment_suggestion"},
          ${"message_suggestion"},
          ${"agent_suggestion"}
        )
        AND COALESCE("payload"->>'expiresAt', '') <> ''
        AND "payload"->>'expiresAt' <= ${nowIso}
    `;

    const expired = [];
    for (const item of items) {
      const payload = (item.payload ?? {}) as Record<string, unknown>;
      const updatedPayload = { ...payload, resolution: "expired" };
      const updated = await prisma.inboxItem.update({
        where: { id: item.id },
        data: {
          status: "expired",
          resolvedAt: now,
          payload: updatedPayload as unknown as Prisma.InputJsonValue,
        },
      });

      await eventService.create({
        organizationId: updated.organizationId,
        scopeType: "system",
        scopeId: updated.organizationId,
        eventType: "inbox_item_resolved",
        payload: { inboxItem: updated, resolution: "expired" } as unknown as Prisma.InputJsonValue,
        actorType: "system",
        actorId: "system",
      });

      expired.push(updated);
    }

    return expired;
  }
}

export const inboxService = new InboxService();
