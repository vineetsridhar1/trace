import type { ActorType, UserRole } from "./generated/types";
import type DataLoader from "dataloader";

export interface Context {
  userId: string;
  organizationId: string;
  role: UserRole;
  actorType: ActorType;
  userLoader: DataLoader<string, { id: string; name: string | null; avatarUrl: string | null } | null>;
}
