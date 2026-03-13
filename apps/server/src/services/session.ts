import type { CodingTool, HostingMode, ActorType } from "@trace/gql";

export interface StartSessionInput {
  tool: CodingTool;
  hosting: HostingMode;
  organizationId: string;
  createdById: string;
  repoId?: string;
  branch?: string;
  ticketId?: string;
  channelId?: string;
  projectId?: string;
  prompt?: string;
}

export class SessionService {
  async start(_input: StartSessionInput) {
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
