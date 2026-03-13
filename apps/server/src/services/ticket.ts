import type { Priority, TicketStatus, ActorType } from "@trace/gql";

export interface CreateTicketInput {
  organizationId: string;
  title: string;
  description?: string;
  priority?: Priority;
  labels?: string[];
  channelId?: string;
  projectId?: string;
  originEventId?: string;
  actorType: ActorType;
  actorId: string;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: Priority;
  labels?: string[];
}

export class TicketService {
  async create(_input: CreateTicketInput) {
    throw new Error("Not implemented");
  }

  async update(_id: string, _input: UpdateTicketInput) {
    throw new Error("Not implemented");
  }

  async addComment(_ticketId: string, _text: string, _actorType: ActorType, _actorId: string) {
    throw new Error("Not implemented");
  }
}

export const ticketService = new TicketService();
