export interface CreateTicketInput {
  organizationId: string;
  title: string;
  description?: string;
  priority?: string;
  labels?: string[];
  channelId?: string;
  projectId?: string;
  originEventId?: string;
  actorType: string;
  actorId: string;
}

export class TicketService {
  async create(_input: CreateTicketInput) {
    throw new Error("Not implemented");
  }

  async update(_id: string, _input: Partial<CreateTicketInput>) {
    throw new Error("Not implemented");
  }

  async addComment(_ticketId: string, _text: string, _actorType: string, _actorId: string) {
    throw new Error("Not implemented");
  }
}

export const ticketService = new TicketService();
