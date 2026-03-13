export interface CreateEventInput {
  organizationId: string;
  scopeType: string;
  scopeId: string;
  eventType: string;
  payload: unknown;
  actorType: string;
  actorId: string;
  parentId?: string;
  metadata?: unknown;
}

export class EventService {
  async create(_input: CreateEventInput) {
    throw new Error("Not implemented");
  }

  async query(_organizationId: string, _opts: { scopeType?: string; scopeId?: string; types?: string[]; after?: Date; limit?: number }) {
    throw new Error("Not implemented");
  }
}

export const eventService = new EventService();
