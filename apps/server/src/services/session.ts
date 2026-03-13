import type { StartSessionInput, ActorType } from "@trace/gql";

export type StartSessionServiceInput = StartSessionInput & {
  organizationId: string;
  createdById: string;
};

export class SessionService {
  async start(_input: StartSessionServiceInput) {
    throw new Error("Not implemented");
  }

  async pause(_id: string) {
    throw new Error("Not implemented");
  }

  async resume(_id: string) {
    throw new Error("Not implemented");
  }

  async terminate(_id: string) {
    throw new Error("Not implemented");
  }

  async sendMessage(_sessionId: string, _text: string, _actorType: ActorType, _actorId: string) {
    throw new Error("Not implemented");
  }
}

export const sessionService = new SessionService();
