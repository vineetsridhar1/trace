import type { ActorType, UserRole } from "./generated/types";

export interface Context {
  userId: string;
  organizationId: string;
  role: UserRole;
  actorType: ActorType;
}
