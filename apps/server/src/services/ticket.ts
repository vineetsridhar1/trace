import type { CreateTicketInput, UpdateTicketInput, ActorType } from "@trace/gql";

export type CreateTicketServiceInput = CreateTicketInput & {
  actorType: ActorType;
  actorId: string;
};

export class TicketService {
  async create(_input: CreateTicketServiceInput) {
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
