import type { ScopeType, EventType, ActorType } from "@trace/gql";

export interface CreateEventInput {
  organizationId: string;
  scopeType: ScopeType;
  scopeId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  actorType: ActorType;
  actorId: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface EventQueryOpts {
  scopeType?: ScopeType;
  scopeId?: string;
  types?: EventType[];
  after?: Date;
  limit?: number;
}

export class EventService {
  async create(_input: CreateEventInput) {
    throw new Error("Not implemented");
  }

  async query(_organizationId: string, _opts: EventQueryOpts) {
    throw new Error("Not implemented");
  }
}

export const eventService = new EventService();
