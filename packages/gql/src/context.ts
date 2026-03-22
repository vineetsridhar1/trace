import type { ActorType, UserRole } from "./generated/types";
import type DataLoader from "dataloader";

export interface Context {
  userId: string;
  /** Active organization ID — set from X-Organization-Id header. Null for org-less operations (e.g. DMs). */
  organizationId: string | null;
  /** Role in the active organization. Null when organizationId is null. */
  role: UserRole | null;
  actorType: ActorType;
  userLoader: DataLoader<string, { id: string; name: string | null; avatarUrl: string | null } | null>;
}
